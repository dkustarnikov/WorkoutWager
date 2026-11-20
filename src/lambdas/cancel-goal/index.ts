import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getCallerId, goalNotFoundResponse, isOwner, unauthorizedResponse } from '../../common/auth';
import { getApiResponse } from '../../common/helpers';
import { Goal, GoalStatus, TransactionEntry } from '../../common/models';
import { releaseStake, remainingEscrowedStake, writeTransaction } from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const GOALS_TABLE = process.env.GOALS_TABLE || 'Goals';
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'Transactions';
const USER_INFO_TABLE = process.env.USER_INFO_TABLE || 'UserInfo';

/**
 * POST /goal/{goalId}/cancel — stop a goal with no penalty.
 * Returns whatever stake is still escrowed: all of it before start or for all-or-nothing,
 * otherwise only the stake of milestones that are still pending.
 */
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

    const goalResult = await dynamoDb.get({ TableName: GOALS_TABLE, Key: { goalId } }).promise();
    if (!isOwner(goalResult.Item as Goal | undefined, callerId)) {
      return goalNotFoundResponse();
    }
    const goal = goalResult.Item as Goal;

    if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed || goal.status === GoalStatus.cancelled) {
      return getApiResponse(400, JSON.stringify({ message: `Goal is already ${goal.status}` }));
    }

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

    const entries: TransactionEntry[] = [];
    if (goal.status === GoalStatus.created) {
      await releaseStake(dynamoDb, USER_INFO_TABLE, goal.userId, goal.stake);
      entries.push({ type: 'refund', amount: goal.stake, reason: 'Goal cancelled before start — stake unfrozen to balance' });
    } else if (goal.allOrNothing) {
      await releaseStake(dynamoDb, USER_INFO_TABLE, goal.userId, goal.stake);
      entries.push({ type: 'refund', amount: goal.stake, reason: 'All-or-nothing goal cancelled — stake returned to balance' });
    } else {
      const remaining = remainingEscrowedStake(goal.milestones);
      if (remaining > 0) {
        await releaseStake(dynamoDb, USER_INFO_TABLE, goal.userId, remaining);
        entries.push({ type: 'refund', amount: remaining, reason: 'Goal cancelled in progress — remaining stake returned to balance' });
      }
    }

    goal.status = GoalStatus.cancelled;
    goal.updatedAt = new Date().toISOString();
    await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();

    if (entries.length > 0) {
      await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, 'cancelled');
    }

    return getApiResponse(200, JSON.stringify({ message: 'Goal cancelled', goal }));
  } catch (err) {
    console.error('Error cancelling goal:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
