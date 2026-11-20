import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getCallerId, goalNotFoundResponse, isOwner, unauthorizedResponse } from '../../common/auth';
import { getApiResponse } from '../../common/helpers';
import { Goal, GoalStatus } from '../../common/models';
import { releaseStake, remainingEscrowedStake } from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';
const USER_INFO_TABLE = process.env.USER_INFO_TABLE || 'UserInfo';

/** DELETE /goal/{goalId} — delete a goal, its deadline rules, and release any escrowed stake. */
export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    if (!goalId) {
      return getApiResponse(400, JSON.stringify({ message: 'Goal ID is required' }));
    }

    const callerId = getCallerId(event);
    if (!callerId) {
      return unauthorizedResponse();
    }

    const existingGoal = await dynamoDb.get({ TableName: TABLE_NAME, Key: { goalId } }).promise();
    if (!isOwner(existingGoal.Item as Goal | undefined, callerId)) {
      return goalNotFoundResponse();
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

    // Active goals still hold escrow: all of it before start or for all-or-nothing,
    // otherwise only the stake of milestones that are still pending.
    if (goal.status === GoalStatus.created || goal.status === GoalStatus.inProgress) {
      const toRelease = goal.allOrNothing || goal.status === GoalStatus.created
        ? goal.stake
        : remainingEscrowedStake(goal.milestones);
      if (toRelease > 0) {
        try {
          await releaseStake(dynamoDb, USER_INFO_TABLE, goal.userId, toRelease);
        } catch (err) {
          console.warn('Failed to release escrow on delete:', err);
        }
      }
    }

    await dynamoDb.delete({ TableName: TABLE_NAME, Key: { goalId } }).promise();

    return getApiResponse(200, JSON.stringify({ message: `Goal ${goalId} deleted successfully` }));
  } catch (error) {
    console.error('Error deleting goal:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
