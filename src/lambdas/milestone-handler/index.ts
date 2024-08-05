import * as awsLambda from 'aws-lambda';
import { getApiResponse } from '../../common/helpers';

export const handler: awsLambda.Handler = async () => {
  console.log("MILESTONE HANDLER IS INVOKED!")
  return getApiResponse(200, JSON.stringify({ message: 'Milestone handler!' }));
};