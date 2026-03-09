import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';

const dynamoDb = new DynamoDB.DocumentClient();
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'Transactions';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;

    if (!goalId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId' }));
    }

    const result = await dynamoDb.query({
      TableName: TRANSACTIONS_TABLE,
      IndexName: 'goalIdIndex',
      KeyConditionExpression: 'goalId = :goalId',
      ExpressionAttributeValues: { ':goalId': goalId },
      ScanIndexForward: false, // newest first
    }).promise();

    return getApiResponse(200, JSON.stringify(result.Items ?? []));
  } catch (error) {
    console.error('Error retrieving transactions:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
