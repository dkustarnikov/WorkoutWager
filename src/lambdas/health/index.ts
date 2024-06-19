import * as awsLambda from 'aws-lambda';

export const handler: awsLambda.Handler = async () => {
  const someKey = process.env.SOME_KEY;
  console.log(`SOME_KEY: ${someKey}`);
  return {
    statusCode: 200,
    message: JSON.stringify({ message: 'Healthy!' }),
    headers: {
      'Content-Type': 'application/json',
    },
  };
};