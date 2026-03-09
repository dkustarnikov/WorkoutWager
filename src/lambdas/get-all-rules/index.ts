import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { computeCompletionPercentage } from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    // userId is injected by the authorizer into requestContext
    const userId = event.requestContext?.authorizer?.userId as string;

    if (!userId) {
      return getApiResponse(400, JSON.stringify({ message: 'Unable to determine userId from token' }));
    }

    const result = await dynamoDb.query({
      TableName: TABLE_NAME,
      IndexName: 'userIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return getApiResponse(200, JSON.stringify([]));
    }

    const goals = result.Items.map(item => ({
      ...item,
      completionPercentage: computeCompletionPercentage(item.milestones || []),
    }));

    return getApiResponse(200, JSON.stringify(goals));
  } catch (error) {
    console.error('Error retrieving goals:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};