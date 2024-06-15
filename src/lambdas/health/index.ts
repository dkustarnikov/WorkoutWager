import * as awsLambda from 'aws-lambda';
import { getApiResponse } from '../../common/helpers';

export const handler: awsLambda.Handler = async () => {
  const someKey = process.env.SOME_KEY;
  console.log(`SOME_KEY: ${someKey}`);
  return getApiResponse(200, JSON.stringify({ message: 'Healthy!' }));
};