import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { Goal, GoalStatus } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const GOALS_TABLE = process.env.GOALS_TABLE || 'Goals';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    if (!goalId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId' }));
    }

    const goalResult = await dynamoDb.get({ TableName: GOALS_TABLE, Key: { goalId } }).promise();
    if (!goalResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Goal not found' }));
    }

    const goal = goalResult.Item as Goal;

    if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed || goal.status === GoalStatus.cancelled) {
      return getApiResponse(400, JSON.stringify({ message: `Goal is already ${goal.status}` }));
    }

    // Cancel all pending EventBridge rules for this goal's milestones
    for (const milestone of goal.milestones) {
      if (milestone.completion === undefined) {
        const ruleName = `MilestoneRule_${milestone.milestoneId}`;
        try {
          await eventBridge.removeTargets({ Rule: ruleName, Ids: [ruleName] }).promise();
          await eventBridge.deleteRule({ Name: ruleName }).promise();
        } catch {
          // ok if already gone
        }
      }
    }

    goal.status = GoalStatus.cancelled;
    goal.updatedAt = new Date().toISOString();
    await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();

    return getApiResponse(200, JSON.stringify({ message: 'Goal cancelled', goal }));
  } catch (err) {
    console.error('Error cancelling goal:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
