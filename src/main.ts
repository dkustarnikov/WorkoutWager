import { App, CfnOutput, Stack, StackProps, aws_lambda as lambda, aws_apigateway as apigateway } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // Define the Lambda function resource
    const healthFunction = new lambda.Function(this, 'health', {
      runtime: lambda.Runtime.NODEJS_20_X, // Choose any supported Node.js runtime
      code: lambda.Code.fromAsset('dist/lambdas/health'), // Ensure this points to the compiled lambda directory
      handler: 'index.handler',
      environment: {
        SOME_KEY: 'some_key variable', // Define your environment variable here
      },
    });

    // Defining DynamoDb tables
    // Users Table
    const usersTable = new dynamodb.Table(this, 'Users', {
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    // WorkoutPlans Table
    new dynamodb.Table(this, 'WorkoutPlans', {
      partitionKey: { name: 'plan_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // UserPlans Table
    const userPlansTable = new dynamodb.Table(this, 'UserPlans', {
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'plan_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    userPlansTable.addGlobalSecondaryIndex({
      indexName: 'plan_id-index',
      partitionKey: { name: 'plan_id', type: dynamodb.AttributeType.STRING },
    });

    // Penalties Table
    const penaltiesTable = new dynamodb.Table(this, 'Penalties', {
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'penalty_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    penaltiesTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
    });
    penaltiesTable.addGlobalSecondaryIndex({
      indexName: 'created_at-index',
      partitionKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
    });

    // Workouts Table
    const workoutsTable = new dynamodb.Table(this, 'Workouts', {
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'workout_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    workoutsTable.addGlobalSecondaryIndex({
      indexName: 'workout_date-index',
      partitionKey: { name: 'workout_date', type: dynamodb.AttributeType.STRING },
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
