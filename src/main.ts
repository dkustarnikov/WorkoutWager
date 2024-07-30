import * as path from 'path';
import { App, CfnOutput, Stack, StackProps, aws_lambda as lambda, aws_apigateway as apigateway } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // DynamoDB Table definitions (unchanged)
    const savingsPlansTable = new Table(this, `SavingsPlans`, {
      partitionKey: { name: 'planId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    savingsPlansTable.addGlobalSecondaryIndex({
      indexName: 'userIdIndex',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
    });

    const rulesTable = new Table(this, `Rules`, {
      partitionKey: { name: 'ruleId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    rulesTable.addGlobalSecondaryIndex({
      indexName: 'ruleNameIndex',
      partitionKey: { name: 'ruleName', type: AttributeType.STRING },
    });

    rulesTable.addGlobalSecondaryIndex({
      indexName: 'planIdIndex',
      partitionKey: { name: 'planId', type: AttributeType.STRING },
    });

    // Cognito User Pool definitions (unchanged)
    const userPool = new cognito.UserPool(this, `WorkoutWagerUserPool`, {
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

    const userPoolDomain = new cognito.UserPoolDomain(this, `UserPoolDomain`, {
      userPool,
      cognitoDomain: {
        domainPrefix: 'workout-wager',
      },
    });

    const resourceServerScope = new cognito.ResourceServerScope({
      scopeName: 'customScope',
      scopeDescription: 'Custom Scope Description',
    });

    const resourceServer = new cognito.UserPoolResourceServer(this, `ResourceServer`, {
      userPool,
      identifier: 'workout-wager',
      scopes: [resourceServerScope],
    });

    const userPoolClientForClientCreds = new cognito.UserPoolClient(this, `WorkoutWagerUserPoolClientForClientCreds`, {
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

    // Lambda function definitions (unchanged)
    const healthFunction = new NodejsFunction(this, `health`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/health/index.ts'), // adjust the path as necessary
      handler: 'handler',
      bundling: {
        externalModules: [],
      },
      environment: {
        SOME_KEY: 'some_key variable',
      },
    });

    const authorizerFunction = new NodejsFunction(this, `authorizer`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/authorizer/index.ts'), // adjust the path as necessary
      handler: 'handler',
      bundling: {
        externalModules: [],
      },
      environment: {
        USER_POOL_CONGNITO_URI: userPool.userPoolProviderUrl,
      },
    });

    const createSavingsPlanFunction = new NodejsFunction(this, `create-savings-plan`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/create-savings-plan/index.ts'), // Adjust the path as necessary
      handler: 'handler',
      environment: {
        SAVINGS_PLANS_TABLE: savingsPlansTable.tableName,
      },
    });

    const createRuleFunction = new NodejsFunction(this, `create-rule`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/create-rule/index.ts'), // Adjust the path as necessary
      handler: 'handler',
      environment: {
        RULES_TABLE: rulesTable.tableName,
      },
    });

    const deleteRuleFunction = new NodejsFunction(this, `delete-rule`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/delete-rule/index.ts'), // Adjust the path as necessary
      handler: 'handler',
      environment: {
        RULES_TABLE: rulesTable.tableName,
      },
    });

    const updateRuleFunction = new NodejsFunction(this, `update-rule`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/update-rule/index.ts'), // Adjust the path as necessary
      handler: 'handler',
      environment: {
        RULES_TABLE: rulesTable.tableName,
      },
    });

    const getRuleByIdFunction = new NodejsFunction(this, `get-rule-by-id`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-rule-by-id/index.ts'), // Adjust the path as necessary
      handler: 'handler',
      environment: {
        RULES_TABLE: rulesTable.tableName,
      },
    });

    const getRuleByNameFunction = new NodejsFunction(this, `get-rule-by-name`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-rule-by-name/index.ts'), // Adjust the path as necessary
      handler: 'handler',
      environment: {
        RULES_TABLE: rulesTable.tableName,
      },
    });

    const getAllRulesFunction = new NodejsFunction(this, `get-all-rules`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-rule-by-name/index.ts'), // Adjust the path as necessary
      handler: 'handler',
      environment: {
        RULES_TABLE: rulesTable.tableName,
      },
    });

    const getUserInfoFunction = new NodejsFunction(this, `get-user-info`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/get-user-info-get/index.ts'), // adjust the path as necessary
      handler: 'handler',
      bundling: {
        externalModules: [],
      },
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
      },
    });

    // Create the custom authorizer
    const authorizer = new apigateway.TokenAuthorizer(this, `MyAuthorizer`, {
      handler: authorizerFunction,
    });

    // Define the API Gateway resource
    const api = new apigateway.LambdaRestApi(this, `WorkoutWagerAPI`, {
      handler: healthFunction,
      proxy: false,
    });

    // Define the '/rule/{ruleId}' resource with a GET method and attach the authorizer
    const ruleResource = api.root.addResource('rule');
    const ruleIdResource = ruleResource.addResource('{ruleId}');
    ruleIdResource.addMethod('GET', new apigateway.LambdaIntegration(getRuleByIdFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    ruleIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteRuleFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    ruleIdResource.addMethod('PUT', new apigateway.LambdaIntegration(updateRuleFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    // Define the '/rule-by-name' resource with a POST method and attach the authorizer
    const ruleByNameResource = api.root.addResource('rule-by-name');
    ruleByNameResource.addMethod('POST', new apigateway.LambdaIntegration(getRuleByNameFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    // Other API Gateway Endpoints (unchanged)
    api.root.addResource('health').addMethod('GET', new apigateway.LambdaIntegration(healthFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    api.root.addResource('get-user-info').addMethod('POST', new apigateway.LambdaIntegration(getUserInfoFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    api.root.addResource('create-savings-plan').addMethod('POST', new apigateway.LambdaIntegration(createSavingsPlanFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    api.root.addResource('create-rule').addMethod('POST', new apigateway.LambdaIntegration(createRuleFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });
    
    api.root.addResource('get-all-rules').addMethod('GET', new apigateway.LambdaIntegration(getAllRulesFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    // Grant the Lambda function permission to access Cognito
    getUserInfoFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsers',
      ],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPool.userPoolId}`],
    }));

    savingsPlansTable.grantReadWriteData(createSavingsPlanFunction);
    rulesTable.grantReadWriteData(createRuleFunction);
    rulesTable.grantReadWriteData(deleteRuleFunction);
    rulesTable.grantReadWriteData(updateRuleFunction);
    rulesTable.grantReadData(getRuleByIdFunction);
    rulesTable.grantReadData(getRuleByNameFunction);
    rulesTable.grantReadData(getAllRulesFunction);

    // Output User Pool ID
    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new CfnOutput(this, 'ResourceServerIdentifier', {
      value: resourceServer.userPoolResourceServerId,
    });

    new CfnOutput(this, 'CognitoDomain', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });

    new CfnOutput(this, 'UserPoolClientIdForClientCreds', {
      value: userPoolClientForClientCreds.userPoolClientId,
    });

    new CfnOutput(this, 'RulesTableName', {
      value: rulesTable.tableName,
    });
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
