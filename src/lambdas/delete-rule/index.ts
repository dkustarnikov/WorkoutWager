import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { Goal } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    if (!goalId) {
      return getApiResponse(400, JSON.stringify({ message: 'Goal ID is required' }));
    }

    const existingGoal = await dynamoDb.get({ TableName: TABLE_NAME, Key: { goalId } }).promise();
    if (!existingGoal.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Goal not found' }));
    }

    const goal = existingGoal.Item as Goal;

    if (Array.isArray(goal.milestones)) {
      for (const milestone of goal.milestones) {
        const milestoneRuleName = `MilestoneRule_${milestone.milestoneId}`;
        try {
          await eventBridge.removeTargets({ Rule: milestoneRuleName, Ids: [milestoneRuleName] }).promise();
          await eventBridge.deleteRule({ Name: milestoneRuleName }).promise();
        } catch {
          // rule may not exist if milestone was already resolved
        }
      }
    }

    await dynamoDb.delete({ TableName: TABLE_NAME, Key: { goalId } }).promise();

    return getApiResponse(200, JSON.stringify({ message: `Goal ${goalId} deleted successfully` }));
  } catch (error) {
    console.error('Error deleting goal:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};
