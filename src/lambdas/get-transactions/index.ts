import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getCallerId, unauthorizedResponse } from '../../common/auth';
import { getApiResponse } from '../../common/helpers';

const dynamoDb = new DynamoDB.DocumentClient();
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'Transactions';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;

    if (!goalId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId' }));
    }

    const callerId = getCallerId(event);
    if (!callerId) {
      return unauthorizedResponse();
    }

    const result = await dynamoDb.query({
      TableName: TRANSACTIONS_TABLE,
      IndexName: 'goalIdIndex',
      KeyConditionExpression: 'goalId = :goalId',
      ExpressionAttributeValues: { ':goalId': goalId },
      ScanIndexForward: false, // newest first
    }).promise();

    // Transactions store the goal owner's userId; never return another user's records.
    const items = (result.Items ?? []).filter(item => item.userId === callerId);
    return getApiResponse(200, JSON.stringify(items));
  } catch (error) {
    console.error('Error retrieving transactions:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
