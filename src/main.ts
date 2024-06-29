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

    /**
     * ========================
     * Defining DynamoDB Tables
     * ========================
     */
    // SavingsPlans Table
    const savingsPlansTable = new Table(this, `SavingsPlans`, {
      partitionKey: { name: 'planId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    savingsPlansTable.addGlobalSecondaryIndex({
      indexName: 'userIdIndex',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
    });

    // Rules table
    const rulesTable = new Table(this, `Rules`, {
      partitionKey: { name: 'ruleId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    // Add a global secondary index for PlanId
    rulesTable.addGlobalSecondaryIndex({
      indexName: 'planIdIndex',
      partitionKey: { name: 'planId', type: AttributeType.STRING },
    });

    /**
    * ========================
    * Defining Cognito User Pool
    * ========================
    */
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

    /**
     * ========================
     * Defining Cognito Domain
     * ========================
     */
    const userPoolDomain = new cognito.UserPoolDomain(this, `UserPoolDomain`, {
      userPool,
      cognitoDomain: {
        domainPrefix: 'workout-wager',
      },
    });

    /**
     * ========================
     * Defining Resource Server and Scopes
     * ========================
     */
    const resourceServerScope = new cognito.ResourceServerScope({
      scopeName: 'customScope',
      scopeDescription: 'Custom Scope Description',
    });

    const resourceServer = new cognito.UserPoolResourceServer(this, `ResourceServer`, {
      userPool,
      identifier: 'workout-wager',
      scopes: [resourceServerScope],
    });

    /**
     * ========================
     * Creating User Pool Client for client_credentials flow
     * ========================
     */
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


    /**
    * ========================
    * Defining Lambdas
    * ========================
    */
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
    
    /**
    * ========================
    * Defining Custom Authorizer
    * ========================
    */
    const authorizer = new apigateway.TokenAuthorizer(this, `MyAuthorizer`, {
      handler: authorizerFunction,
    });

    /**
    * ========================
    * Defining the API Gateway Resource
    * ========================
    */
    const api = new apigateway.LambdaRestApi(this, `WorkoutWagerAPI`, {
      handler: healthFunction,
      proxy: false,
    });

    /**
    * ========================
    * Degining API Gateway Endpoints
    * ========================
    */

    api.root.addResource('health').addMethod('GET', new apigateway.LambdaIntegration(healthFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    api.root.addResource('get-user-info').addMethod('POST', new apigateway.LambdaIntegration(getUserInfoFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    api.root.addResource('create-savings-plan').addMethod('POST', new apigateway.LambdaIntegration(createSavingsPlanFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    api.root.addResource('create-rule').addMethod('POST', new apigateway.LambdaIntegration(createRuleFunction), {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM
    });

    /**
    * ========================
    * Defining Permissions
    * ========================
    */
    // Grant the Lambda function permission to access Cognito
    getUserInfoFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser', 'cognito-idp:ListUsers'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPool.userPoolId}`],
    }));

    savingsPlansTable.grantReadWriteData(createSavingsPlanFunction);
    rulesTable.grantReadWriteData(createRuleFunction);

    // Output User Pool ID
    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    // Output Resource Server Identifier (Optional)
    new CfnOutput(this, 'ResourceServerIdentifier', {
      value: resourceServer.userPoolResourceServerId,
    });

    // Output Cognito Domain
    new CfnOutput(this, 'CognitoDomain', {
      value: `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
    });

    // Output User Pool Client ID for Client Credentials
    new CfnOutput(this, 'UserPoolClientIdForClientCreds', {
      value: userPoolClientForClientCreds.userPoolClientId,
    });

    // Output the table name
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
