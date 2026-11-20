import * as path from 'path';
import { App, CfnOutput, Stack, StackProps, aws_lambda as lambda, aws_apigateway as apigateway, Duration } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

// Public hostnames. The API is served at API_DOMAIN via an API Gateway custom domain
// (DNS lives in Cloudflare — see the CloudflareDnsInstructions output); the web UI at WEB_ORIGIN.
const API_DOMAIN = 'wager.api.dkustarnikov.com';
const WEB_ORIGIN = 'https://wager.dkustarnikov.com';
const LOCAL_WEB_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];
const MOBILE_SCHEME = 'workoutwager://';
const ALLOWED_CORS_ORIGINS = [...LOCAL_WEB_ORIGINS, WEB_ORIGIN];
const CALLBACK_URLS = [...ALLOWED_CORS_ORIGINS.map(o => `${o}/auth/callback`), `${MOBILE_SCHEME}auth/callback`];
const LOGOUT_URLS = [...ALLOWED_CORS_ORIGINS.map(o => `${o}/auth/logout`), `${MOBILE_SCHEME}auth/logout`];

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // Goals table (formerly Rules)
    const goalsTable = new Table(this, 'Goals', {
      partitionKey: { name: 'goalId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    goalsTable.addGlobalSecondaryIndex({
      indexName: 'userIdIndex',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
    });

    // Transactions table
    const transactionsTable = new Table(this, 'Transactions', {
      partitionKey: { name: 'transactionId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    transactionsTable.addGlobalSecondaryIndex({
      indexName: 'goalIdIndex',
      partitionKey: { name: 'goalId', type: AttributeType.STRING },
    });

    // UserInfo table
    const userInfoTable = new Table(this, 'UserInfo', {
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    // SQS queue for milestone deadline events (EventBridge → SQS → milestone-handler)
    const milestoneQueue = new sqs.Queue(this, 'MilestoneQueue', {
      visibilityTimeout: Duration.minutes(5),
      retentionPeriod: Duration.days(1),
    });

    milestoneQueue.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('events.amazonaws.com')],
      actions: ['sqs:SendMessage'],
      resources: [milestoneQueue.queueArn],
    }));

    // Cognito User Pool definitions (unchanged)
    const userPool = new cognito.UserPool(this, 'WorkoutWagerUserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      signInCaseSensitive: false,
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
    });

    const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: 'workout-wager',
      },
    });

    const resourceServerScope = new cognito.ResourceServerScope({
      scopeName: 'customScope',
      scopeDescription: 'Custom Scope Description',
    });

    const resourceServer = new cognito.UserPoolResourceServer(this, 'ResourceServer', {
      userPool,
      identifier: 'workout-wager',
      scopes: [resourceServerScope],
    });

    const userPoolClientForClientCreds = new cognito.UserPoolClient(this, 'WorkoutWagerUserPoolClientForClientCreds', {
      userPool,
      generateSecret: true,
      oAuth: {
        flows: {
          clientCredentials: true,
        },
        scopes: [
          cognito.OAuthScope.resourceServer(resourceServer, resourceServerScope),
        ],
      },
    });

    // Public app client (no secret) for the Android app, the web UI and Bruno.
    // Hosted UI uses authorization code + PKCE; Bruno/CLI can still use USER_PASSWORD_AUTH.
    const userPoolClientForUserAuth = new cognito.UserPoolClient(this, 'WorkoutWagerUserPoolClientForUserAuth', {
      userPool,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: CALLBACK_URLS,
        logoutUrls: LOGOUT_URLS,
      },
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    });

    const healthFunction = new NodejsFunction(this, 'health', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/health/index.ts'),
      handler: 'handler',
      bundling: { externalModules: [] },
      environment: { SOME_KEY: 'some_key variable' },
    });

    const authorizerFunction = new NodejsFunction(this, 'authorizer', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/authorizer/index.ts'),
      handler: 'handler',
      bundling: { externalModules: [] },
      environment: {
        COGNITO_ISSUER: userPool.userPoolProviderUrl,
        // Only tokens issued to these app clients are accepted (comma-separated).
        COGNITO_ALLOWED_CLIENT_IDS: userPoolClientForUserAuth.userPoolClientId,
      },
    });

    // milestone-handler: SQS-triggered, handles missed milestones + writes transactions
    const milestoneHandlerFunction = new NodejsFunction(this, 'milestone-handler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/milestone-handler/index.ts'),
      handler: 'handler',
      timeout: Duration.minutes(2),
      environment: {
        GOALS_TABLE: goalsTable.tableName,
        TRANSACTIONS_TABLE: transactionsTable.tableName,
        USER_INFO_TABLE: userInfoTable.tableName,
      },
    });

    milestoneHandlerFunction.addEventSource(new SqsEventSource(milestoneQueue, { batchSize: 1 }));

    const createGoalFunction = new NodejsFunction(this, 'create-goal', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/create-rule/index.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE: goalsTable.tableName,
        SQS_QUEUE_ARN: milestoneQueue.queueArn,
        TRANSACTIONS_TABLE: transactionsTable.tableName,
        USER_INFO_TABLE: userInfoTable.tableName,
      },
    });

    const deleteGoalFunction = new NodejsFunction(this, 'delete-goal', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/delete-rule/index.ts'),
      handler: 'handler',
      environment: { GOALS_TABLE: goalsTable.tableName, USER_INFO_TABLE: userInfoTable.tableName },
    });

    const updateGoalFunction = new NodejsFunction(this, 'update-goal', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/update-rule/index.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE: goalsTable.tableName,
        SQS_QUEUE_ARN: milestoneQueue.queueArn,
        USER_INFO_TABLE: userInfoTable.tableName,
      },
    });

    const getGoalByIdFunction = new NodejsFunction(this, 'get-goal-by-id', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-rule-by-id/index.ts'),
      handler: 'handler',
      environment: { GOALS_TABLE: goalsTable.tableName },
    });

    const getAllGoalsFunction = new NodejsFunction(this, 'get-all-goals', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-all-rules/index.ts'),
      handler: 'handler',
      environment: { GOALS_TABLE: goalsTable.tableName },
    });

    const getUserInfoFunction = new NodejsFunction(this, 'get-user-info', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-user-info-get/index.ts'),
      handler: 'handler',
      bundling: { externalModules: [] },
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: {
        USER_INFO_TABLE: userInfoTable.tableName,
      },
    });

    const configureUserFunction = new NodejsFunction(this, 'configure-user', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/configure-user/index.ts'),
      handler: 'handler',
      bundling: { externalModules: [] },
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        GOALS_TABLE: goalsTable.tableName,
        USER_INFO_TABLE: userInfoTable.tableName,
      },
    });

    const addMilestoneFunction = new NodejsFunction(this, 'add-milestone', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/add-milestone/index.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE: goalsTable.tableName,
        SQS_QUEUE_ARN: milestoneQueue.queueArn,
      },
    });

    const updateMilestoneFunction = new NodejsFunction(this, 'update-milestone', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/update-milestone/index.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE: goalsTable.tableName,
        SQS_QUEUE_ARN: milestoneQueue.queueArn,
      },
    });

    const completeMilestoneFunction = new NodejsFunction(this, 'complete-milestone', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/complete-milestone/index.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE: goalsTable.tableName,
        TRANSACTIONS_TABLE: transactionsTable.tableName,
        USER_INFO_TABLE: userInfoTable.tableName,
      },
    });

    const getTransactionsFunction = new NodejsFunction(this, 'get-transactions', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-transactions/index.ts'),
      handler: 'handler',
      environment: { TRANSACTIONS_TABLE: transactionsTable.tableName },
    });

    const cancelGoalFunction = new NodejsFunction(this, 'cancel-goal', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/cancel-goal/index.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE: goalsTable.tableName,
        TRANSACTIONS_TABLE: transactionsTable.tableName,
        USER_INFO_TABLE: userInfoTable.tableName,
      },
    });

    const getLeaderboardFunction = new NodejsFunction(this, 'get-leaderboard', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-leaderboard/index.ts'),
      handler: 'handler',
      environment: { USER_INFO_TABLE: userInfoTable.tableName },
    });

    const configurePaymentsFunction = new NodejsFunction(this, 'configure-payments', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/configure-payments/index.ts'),
      handler: 'handler',
      environment: { USER_INFO_TABLE: userInfoTable.tableName },
    });

    // --- API Gateway ---

    const authorizer = new apigateway.TokenAuthorizer(this, 'MyAuthorizer', {
      handler: authorizerFunction,
    });

    const api = new apigateway.LambdaRestApi(this, 'WorkoutWagerAPI', {
      handler: healthFunction,
      proxy: false,
      // Browser clients (web UI, local dev) need CORS preflight on every route.
      defaultCorsPreflightOptions: {
        allowOrigins: ALLOWED_CORS_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
        maxAge: Duration.hours(1),
      },
    });

    const authOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    // Public, so uptime checks don't need a token.
    api.root.addResource('health').addMethod('GET', new apigateway.LambdaIntegration(healthFunction));

    // /goal + /goal/{goalId}
    const goalResource = api.root.addResource('goal');
    const goalIdResource = goalResource.addResource('{goalId}');
    goalResource.addMethod('POST', new apigateway.LambdaIntegration(createGoalFunction), authOptions);
    goalIdResource.addMethod('GET', new apigateway.LambdaIntegration(getGoalByIdFunction), authOptions);
    goalIdResource.addMethod('PUT', new apigateway.LambdaIntegration(updateGoalFunction), authOptions);
    goalIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteGoalFunction), authOptions);
    goalIdResource.addResource('transactions').addMethod('GET', new apigateway.LambdaIntegration(getTransactionsFunction), authOptions);
    goalIdResource.addResource('cancel').addMethod('POST', new apigateway.LambdaIntegration(cancelGoalFunction), authOptions);

    // /goal/{goalId}/milestone + /goal/{goalId}/milestone/{milestoneId}
    const milestoneResource = goalIdResource.addResource('milestone');
    milestoneResource.addMethod('POST', new apigateway.LambdaIntegration(addMilestoneFunction), authOptions);
    const milestoneIdResource = milestoneResource.addResource('{milestoneId}');
    milestoneIdResource.addMethod('PUT', new apigateway.LambdaIntegration(updateMilestoneFunction), authOptions);
    milestoneIdResource.addResource('complete').addMethod('POST', new apigateway.LambdaIntegration(completeMilestoneFunction), authOptions);

    // GET /goals  (list user's goals)
    api.root.addResource('goals').addMethod('GET', new apigateway.LambdaIntegration(getAllGoalsFunction), authOptions);

    api.root.addResource('configure-user').addMethod('POST', new apigateway.LambdaIntegration(configureUserFunction), authOptions);
    api.root.addResource('get-user-info').addMethod('POST', new apigateway.LambdaIntegration(getUserInfoFunction), authOptions);
    api.root.addResource('configure-payments').addMethod('POST', new apigateway.LambdaIntegration(configurePaymentsFunction), authOptions);
    api.root.addResource('leaderboard').addMethod('GET', new apigateway.LambdaIntegration(getLeaderboardFunction), authOptions);

    // --- IAM permissions ---

    const cognitoPolicy = new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser', 'cognito-idp:ListUsers'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPool.userPoolId}`],
    });
    configureUserFunction.addToRolePolicy(cognitoPolicy);

    // DynamoDB - goals table
    goalsTable.grantReadWriteData(addMilestoneFunction);
    goalsTable.grantReadWriteData(completeMilestoneFunction);
    goalsTable.grantReadWriteData(configureUserFunction);
    goalsTable.grantReadWriteData(createGoalFunction);
    goalsTable.grantReadWriteData(deleteGoalFunction);
    goalsTable.grantReadWriteData(milestoneHandlerFunction);
    goalsTable.grantReadData(getAllGoalsFunction);
    goalsTable.grantReadData(getGoalByIdFunction);
    goalsTable.grantReadWriteData(updateMilestoneFunction);
    goalsTable.grantReadWriteData(updateGoalFunction);
    goalsTable.grantReadWriteData(cancelGoalFunction);

    // DynamoDB - transactions table
    transactionsTable.grantReadWriteData(completeMilestoneFunction);
    transactionsTable.grantReadWriteData(milestoneHandlerFunction);
    transactionsTable.grantReadData(getTransactionsFunction);

    // DynamoDB - user info table
    userInfoTable.grantReadWriteData(milestoneHandlerFunction); // forfeits stakes on missed deadlines
    userInfoTable.grantReadWriteData(configureUserFunction);
    userInfoTable.grantReadData(getUserInfoFunction);
    // Stake escrow: these functions move money between balance and pendingBalance.
    const escrowFunctions = [
      createGoalFunction, updateGoalFunction, deleteGoalFunction,
      cancelGoalFunction, completeMilestoneFunction, configurePaymentsFunction,
    ];
    for (const fn of escrowFunctions) {
      userInfoTable.grantReadWriteData(fn);
    }
    userInfoTable.grantReadData(getLeaderboardFunction);
    transactionsTable.grantReadWriteData(createGoalFunction);
    transactionsTable.grantReadWriteData(cancelGoalFunction);

    // SQS send access for functions that create EventBridge→SQS rules
    milestoneQueue.grantSendMessages(createGoalFunction);
    milestoneQueue.grantSendMessages(updateGoalFunction);
    milestoneQueue.grantSendMessages(addMilestoneFunction);
    milestoneQueue.grantSendMessages(updateMilestoneFunction);

    // EventBridge
    const eventBridgePolicy = new iam.PolicyStatement({
      actions: [
        'events:DeleteRule',
        'events:DescribeRule',
        'events:ListRules',
        'events:ListTargetsByRule',
        'events:PutRule',
        'events:PutTargets',
        'events:RemoveTargets',
      ],
      resources: ['*'],
    });
    addMilestoneFunction.addToRolePolicy(eventBridgePolicy);
    completeMilestoneFunction.addToRolePolicy(eventBridgePolicy);
    createGoalFunction.addToRolePolicy(eventBridgePolicy);
    updateMilestoneFunction.addToRolePolicy(eventBridgePolicy);
    updateGoalFunction.addToRolePolicy(eventBridgePolicy);
    milestoneHandlerFunction.addToRolePolicy(eventBridgePolicy);
    deleteGoalFunction.addToRolePolicy(eventBridgePolicy);
    cancelGoalFunction.addToRolePolicy(eventBridgePolicy);

    // --- Custom domain: https://wager.api.dkustarnikov.com ---
    // DNS is in Cloudflare (not Route 53), so the certificate is validated by a CNAME you add
    // manually — see the CloudflareDnsInstructions output.
    const apiCertificate = new acm.Certificate(this, 'ApiCertificate', {
      domainName: API_DOMAIN,
      validation: acm.CertificateValidation.fromDns(),
    });
    const apiCustomDomain = new apigateway.DomainName(this, 'ApiCustomDomain', {
      domainName: API_DOMAIN,
      certificate: apiCertificate,
      endpointType: apigateway.EndpointType.REGIONAL,
      securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
    });
    new apigateway.BasePathMapping(this, 'ApiBasePathMapping', {
      domainName: apiCustomDomain,
      restApi: api,
    });

    // --- Outputs ---
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'ResourceServerIdentifier', { value: resourceServer.userPoolResourceServerId });
    new CfnOutput(this, 'CognitoDomain', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
    new CfnOutput(this, 'UserPoolClientIdForClientCreds', { value: userPoolClientForClientCreds.userPoolClientId });
    new CfnOutput(this, 'GoalsTableName', { value: goalsTable.tableName });
    new CfnOutput(this, 'MilestoneQueueUrl', { value: milestoneQueue.queueUrl });

    // --- App / client outputs ---
    const cognitoBaseUrl = `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`;
    new CfnOutput(this, 'AppClientId', { value: userPoolClientForUserAuth.userPoolClientId, description: 'Public app client id for Android, Web and Bruno (no secret, PKCE)' });
    new CfnOutput(this, 'AppAuthorizeUrl', { value: `${cognitoBaseUrl}/oauth2/authorize`, description: 'Hosted UI authorize endpoint — use authorization code + PKCE' });
    new CfnOutput(this, 'AppCallbackUrls', { value: CALLBACK_URLS.join(','), description: 'Registered OAuth redirect URIs' });
    new CfnOutput(this, 'AppAllowedCorsOrigins', { value: ALLOWED_CORS_ORIGINS.join(','), description: 'Browser origins allowed by the API CORS preflight' });
    new CfnOutput(this, 'WebOrigin', { value: WEB_ORIGIN, description: 'UI origin used for Cognito callbacks + CORS' });
    new CfnOutput(this, 'ApiCustomDomainName', { value: API_DOMAIN, description: 'Public API hostname (Cloudflare CNAME name)' });
    new CfnOutput(this, 'ApiCustomDomainTarget', { value: apiCustomDomain.domainNameAliasDomainName, description: 'Cloudflare CNAME target for the API hostname (DNS-only / grey cloud)' });
    new CfnOutput(this, 'ApiCustomDomainHostedZoneId', { value: apiCustomDomain.domainNameAliasHostedZoneId, description: 'API Gateway regional hosted zone id (for alias records if used)' });
    new CfnOutput(this, 'ApiBaseUrl', { value: `https://${API_DOMAIN}`, description: 'Canonical API base URL for Android, Web, Bruno, and smoke tests' });
    new CfnOutput(this, 'CloudflareDnsInstructions', {
      value: [
        '1) If deploy waits on ACM: ACM console → Certificate → copy CNAME name/value → add in Cloudflare (DNS-only).',
        `2) Add CNAME ${API_DOMAIN} → ${apiCustomDomain.domainNameAliasDomainName} (DNS-only / grey cloud).`,
        '3) UI later: point wager.dkustarnikov.com at Vercel.',
      ].join(' '),
      description: 'DNS steps for Cloudflare after/during deploy',
    });

    // --- Bruno collection outputs ---
    new CfnOutput(this, 'BrunoBaseUrl', {
      value: `https://${API_DOMAIN}`,
      description: 'Bruno env → baseUrl (custom domain; execute-api URL still works)',
    });
    new CfnOutput(this, 'BrunoExecuteApiUrl', {
      value: api.url,
      description: 'Raw API Gateway execute-api URL (fallback while DNS propagates)',
    });
    new CfnOutput(this, 'BrunoUserPoolClientId', {
      value: userPoolClientForUserAuth.userPoolClientId,
      description: 'Bruno env → clientId — use with Cognito InitiateAuth to get authToken',
    });
    new CfnOutput(this, 'BrunoTokenEndpoint', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com/oauth2/token`,
      description: 'Bruno env → tokenEndpoint — POST here to exchange credentials for JWT',
    });
    new CfnOutput(this, 'BrunoGetTokenCommand', {
      value: [
        'aws cognito-idp initiate-auth',
        '--client-id <BrunoUserPoolClientId>',
        '--auth-flow USER_PASSWORD_AUTH',
        '--auth-parameters USERNAME=<your-email>,PASSWORD=<your-password>',
        `--region ${this.region}`,
        '| jq -r \'.AuthenticationResult.IdToken\'',
      ].join(' '),
      description: 'CLI command to get a JWT — paste output into Bruno authToken env var',
    });
  }
}

// The live stack, its ACM certificate and custom domain are in us-east-2. The region is pinned
// so a deploy from a machine whose default region differs can't create a second copy elsewhere.
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-2',
};

const app = new App();
const stackName = 'workout-wager-dev';

new MyStack(app, stackName, { env: devEnv });

app.synth();
