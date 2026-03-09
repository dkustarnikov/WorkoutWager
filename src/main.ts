import * as path from 'path';
import { App, CfnOutput, Stack, StackProps, aws_lambda as lambda, aws_apigateway as apigateway, Duration } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

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
      environment: { USER_POOL_CONGNITO_URI: userPool.userPoolProviderUrl },
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
      },
    });

    const deleteGoalFunction = new NodejsFunction(this, 'delete-goal', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/delete-rule/index.ts'),
      handler: 'handler',
      environment: { GOALS_TABLE: goalsTable.tableName },
    });

    const updateGoalFunction = new NodejsFunction(this, 'update-goal', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/update-rule/index.ts'),
      handler: 'handler',
      environment: {
        GOALS_TABLE: goalsTable.tableName,
        SQS_QUEUE_ARN: milestoneQueue.queueArn,
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
        COGNITO_USER_POOL_ID: userPool.userPoolId,
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
      environment: { GOALS_TABLE: goalsTable.tableName },
    });

    // --- API Gateway ---

    const authorizer = new apigateway.TokenAuthorizer(this, 'MyAuthorizer', {
      handler: authorizerFunction,
    });

    const api = new apigateway.LambdaRestApi(this, 'WorkoutWagerAPI', {
      handler: healthFunction,
      proxy: false,
    });

    const authOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    api.root.addResource('health').addMethod('GET', new apigateway.LambdaIntegration(healthFunction), authOptions);

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

    // --- IAM permissions ---

    const cognitoPolicy = new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser', 'cognito-idp:ListUsers'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPool.userPoolId}`],
    });
    configureUserFunction.addToRolePolicy(cognitoPolicy);
    getUserInfoFunction.addToRolePolicy(cognitoPolicy);

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
    userInfoTable.grantReadData(milestoneHandlerFunction);
    userInfoTable.grantReadWriteData(configureUserFunction);
    userInfoTable.grantReadWriteData(getUserInfoFunction);

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

    // --- Outputs ---
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'ResourceServerIdentifier', { value: resourceServer.userPoolResourceServerId });
    new CfnOutput(this, 'CognitoDomain', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });
    new CfnOutput(this, 'UserPoolClientIdForClientCreds', { value: userPoolClientForClientCreds.userPoolClientId });
    new CfnOutput(this, 'GoalsTableName', { value: goalsTable.tableName });
    new CfnOutput(this, 'MilestoneQueueUrl', { value: milestoneQueue.queueUrl });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();
const stackName = 'workout-wager-dev';

new MyStack(app, stackName, { env: devEnv });

app.synth();
