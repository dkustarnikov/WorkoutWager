import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { Goal } from '../../common/models';
import { computeCompletionPercentage } from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;

    if (!goalId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goal ID' }));
    }

    const result = await dynamoDb.get({
      TableName: TABLE_NAME,
      Key: { goalId },
    }).promise();

    if (!result.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Goal not found' }));
    }

    const goal = result.Item as Goal;
    return getApiResponse(200, JSON.stringify({
      ...goal,
      completionPercentage: computeCompletionPercentage(goal.milestones),
    }));
  } catch (error) {
    console.error('Error retrieving goal:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};