import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getCallerId, goalNotFoundResponse, isOwner, unauthorizedResponse } from '../../common/auth';
import { getApiResponse } from '../../common/helpers';
import { Goal, GoalStatus, TransactionEntry } from '../../common/models';
import {
  allMilestonesResolved,
  computeCompletionPercentage,
  settleGoalWin,
  settleMilestoneWin,
  writeTransaction,
} from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const GOALS_TABLE = process.env.GOALS_TABLE || 'Goals';
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'Transactions';
const USER_INFO_TABLE = process.env.USER_INFO_TABLE || 'UserInfo';

/**
 * POST /goal/{goalId}/milestone/{milestoneId}/complete
 *
 * Per-milestone goals: the milestone's stake is returned immediately, plus 10% stars.
 * All-or-nothing goals: nothing settles until the last milestone is completed; then the
 * whole stake is returned plus stars.
 */
export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    const milestoneId = event.pathParameters?.milestoneId;
    if (!goalId || !milestoneId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId or milestoneId' }));
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
      return getApiResponse(400, JSON.stringify({ message: 'Goal already resolved' }));
    }

    const index = goal.milestones.findIndex(m => m.milestoneId === milestoneId);
    if (index === -1) {
      return getApiResponse(404, JSON.stringify({ message: 'Milestone not found' }));
    }

    const milestone = goal.milestones[index];
    if (milestone.completion === true) {
      return getApiResponse(200, JSON.stringify({ message: 'Milestone already completed' }));
    }
    if (milestone.completion === false) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot complete a missed milestone' }));
    }

    milestone.completion = true;
    goal.milestones[index] = milestone;
    goal.updatedAt = new Date().toISOString();
    if (goal.status === GoalStatus.created) {
      goal.status = GoalStatus.inProgress;
    }

    // The deadline no longer matters for this milestone.
    const milestoneRuleName = `MilestoneRule_${milestoneId}`;
    try {
      await eventBridge.removeTargets({ Rule: milestoneRuleName, Ids: [milestoneRuleName] }).promise();
      await eventBridge.deleteRule({ Name: milestoneRuleName }).promise();
    } catch {
      // ok if already gone
    }

    const entries: TransactionEntry[] = [];
    const resolved = allMilestonesResolved(goal.milestones);

    if (goal.allOrNothing) {
      if (resolved) {
        entries.push(...await settleGoalWin(dynamoDb, USER_INFO_TABLE, goal.userId, goal.stake));
        await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, 'won');
        goal.status = GoalStatus.completed;
        await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();
        return getApiResponse(200, JSON.stringify({
          message: 'Milestone completed — goal resolved',
          outcome: 'won',
          completionPercentage: computeCompletionPercentage(goal.milestones),
          goal,
        }));
      }
      await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();
      return getApiResponse(200, JSON.stringify({
        message: 'Milestone marked as completed',
        completionPercentage: computeCompletionPercentage(goal.milestones),
        goal,
      }));
    }

    const winEntries = await settleMilestoneWin(dynamoDb, USER_INFO_TABLE, goal.userId, milestone.stake);
    entries.push(...winEntries.map(e => ({
      ...e,
      reason: e.type === 'refund'
        ? `Milestone completed: ${milestone.milestoneName} — stake returned`
        : `Milestone completed: ${milestone.milestoneName} — 10% stars`,
    })));

    if (resolved) {
      const outcome = goal.milestones.some(m => m.completion === false) ? 'mixed' : 'won';
      await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, outcome);
      goal.status = GoalStatus.completed;
      await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();
      return getApiResponse(200, JSON.stringify({
        message: 'Milestone completed — goal resolved',
        outcome,
        completionPercentage: computeCompletionPercentage(goal.milestones),
        goal,
      }));
    }

    await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, 'won');
    await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();
    return getApiResponse(200, JSON.stringify({
      message: 'Milestone marked as completed',
      completionPercentage: computeCompletionPercentage(goal.milestones),
      goal,
    }));
  } catch (err) {
    console.error('Error in complete-milestone:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
