import { App, CfnOutput, Stack, StackProps, aws_lambda as lambda, aws_apigateway as apigateway } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // Define the Lambda function resource
    const healthFunction = new lambda.Function(this, 'health', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset('dist/health'), // Ensure this points to the compiled lambda directory
      handler: 'index.handler',
      environment: {
        SOME_KEY: 'some_key variable', // Define your environment variable here
      },
    });

    // Define the API Gateway resource
    const api = new apigateway.LambdaRestApi(this, 'WorkoutWagerAPI', {
      handler: healthFunction,
      proxy: false,
    });

    // Define the '/health' resource with a GET method
    const healthEndpoint = api.root.addResource('health');
    healthEndpoint.addMethod('GET');

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
