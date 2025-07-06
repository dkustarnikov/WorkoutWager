import * as awsLambda from 'aws-lambda';
import { getApiResponse } from '../../common/helpers';

export const handler: awsLambda.Handler = async () => {
  const someKey = process.env.SOME_KEY;
  console.log(`SOME_KEY: ${someKey}`);
  return getApiResponse(200, JSON.stringify({ message: 'Healthy!' }));
};

// This code is an AWS Lambda function that checks the health of the service.
// It retrieves an environment variable `SOME_KEY` and logs it.
// If the function executes successfully, it returns a 200 response with a message indicating that the service is healthy.
// This is typically used for health checks in serverless applications to ensure that the Lambda function is running correctly.