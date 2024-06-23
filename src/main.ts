import * as path from 'path';
import { App, CfnOutput, Stack, StackProps, aws_lambda as lambda, aws_apigateway as apigateway } from 'aws-cdk-lib';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

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

    new CfnOutput(this, 'TestBucket', { value: '' });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new MyStack(app, 'workout-wager-dev', { env: devEnv });

app.synth();
