import * as path from 'path';
import { App, CfnOutput, Stack, StackProps, aws_lambda as lambda, aws_apigateway as apigateway } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    /**
    * ========================
    * Defining Lambdas
    * ========================
    */
   
    const healthFunction = new NodejsFunction(this, 'health', {
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

    const authorizerFunction = new NodejsFunction(this, 'authorizer', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambdas/authorizer/index.ts'), // adjust the path as necessary
      handler: 'handler',
      bundling: {
        externalModules: [],
      },
      environment: {
        JWT_SECRET: 'Some secret',
      },
    });


    /**
     * ========================
     * Defining Cognito User Pool
     * ========================
     */
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

    /**
     * ========================
     * Defining Cognito Domain
     * ========================
     */
    const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: process.env.STACK_NAME ? `${process.env.STACK_NAME}-workout-wager` : 'workout-wager',
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

    const resourceServer = new cognito.UserPoolResourceServer(this, 'ResourceServer', {
      userPool,
      identifier: process.env.STACK_NAME ? `${process.env.STACK_NAME}-workout-wager` : 'workout-wager',
      scopes: [resourceServerScope],
    });

    /**
     * ========================
     * Creating User Pool Client for client_credentials flow
     * ========================
     */
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

    // Create the custom authorizer
    const authorizer = new apigateway.TokenAuthorizer(this, 'MyAuthorizer', {
      handler: authorizerFunction,
    });

    // Define the API Gateway resource
    const api = new apigateway.LambdaRestApi(this, 'WorkoutWagerAPI', {
      handler: healthFunction,
      proxy: false,
    });

    // Define the '/health' resource with a GET method and attach the authorizer
    const healthEndpoint = api.root.addResource('health');
    healthEndpoint.addMethod('GET', new apigateway.LambdaIntegration(healthFunction), {
      authorizer: authorizer,
    });

    const getUserInfoFunction = new NodejsFunction(this, 'get-user-info', {
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

    api.root.addResource('get-user-info').addMethod('POST', new apigateway.LambdaIntegration(getUserInfoFunction), {
      authorizer: authorizer
    });

    // Grant the Lambda function permission to access Cognito
    getUserInfoFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser', 'cognito-idp:ListUsers'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPool.userPoolId}`],
    }));

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

    new CfnOutput(this, 'TestBucket', { value: '' });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();
const stackName = `workout-wager-${process.env.STACK_NAME}` || 'workout-wager-dev';

new MyStack(app, stackName, { env: devEnv });

app.synth();