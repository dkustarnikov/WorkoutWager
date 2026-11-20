import { SQSEvent } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { Goal, GoalStatus } from '../../common/models';
import {
  allMilestonesResolved,
  settleGoalLoss,
  settleMilestoneLoss,
  writeTransaction,
} from '../../common/transactionUtils';

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const eventBridge = new AWS.EventBridge();
const GOALS_TABLE = process.env.GOALS_TABLE || 'Goals';
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'Transactions';
const USER_INFO_TABLE = process.env.USER_INFO_TABLE || 'UserInfo';

/**
 * Triggered by SQS (EventBridge → SQS → this Lambda) at a milestone's deadline.
 * If the milestone is still pending it is marked missed and its stake forfeited.
 * All-or-nothing goals fail outright: the whole stake is forfeited.
 */
export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      const { goalId, milestoneId } = JSON.parse(record.body);

      if (!goalId || !milestoneId) {
        console.error('Missing goalId or milestoneId in SQS message');
        continue;
      }

      const goalResult = await dynamoDb.get({ TableName: GOALS_TABLE, Key: { goalId } }).promise();
      if (!goalResult.Item) {
        console.warn(`Goal ${goalId} not found — skipping`);
        continue;
      }
      const goal = goalResult.Item as Goal;

      if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed || goal.status === GoalStatus.cancelled) {
        console.log(`Goal ${goalId} already resolved — skipping`);
        continue;
      }

      const milestoneIndex = goal.milestones.findIndex(m => m.milestoneId === milestoneId);
      if (milestoneIndex === -1) {
        console.warn(`Milestone ${milestoneId} not found in goal ${goalId}`);
        continue;
      }

      const milestone = goal.milestones[milestoneIndex];
      if (milestone.completion === true) {
        console.log(`Milestone ${milestoneId} already completed — skipping`);
        continue;
      }
      if (milestone.completion === false) {
        // A retried SQS message must not forfeit the stake twice.
        console.log(`Milestone ${milestoneId} already missed — skipping`);
        continue;
      }

      goal.milestones[milestoneIndex] = { ...milestone, completion: false };
      goal.updatedAt = new Date().toISOString();
      if (goal.status === GoalStatus.created) {
        goal.status = GoalStatus.inProgress;
      }

      if (goal.allOrNothing) {
        for (const m of goal.milestones) {
          if (m.completion === undefined) {
            const ruleName = `MilestoneRule_${m.milestoneId}`;
            try {
              await eventBridge.removeTargets({ Rule: ruleName, Ids: [ruleName] }).promise();
              await eventBridge.deleteRule({ Name: ruleName }).promise();
            } catch {
              // ok if already gone
            }
          }
        }
        goal.milestones = goal.milestones.map(m => (m.completion !== undefined ? m : { ...m, completion: false }));

        const entries = await settleGoalLoss(dynamoDb, USER_INFO_TABLE, goal.userId, goal.stake);
        await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, 'lost');
        goal.status = GoalStatus.failed;
        await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();
        console.log(`Goal ${goalId} failed (all-or-nothing): stake forfeited`);
        continue;
      }

      const entries = await settleMilestoneLoss(dynamoDb, USER_INFO_TABLE, goal.userId, milestone.stake);
      entries[0].reason = `Milestone missed: ${milestone.milestoneName} — stake forfeited`;

      if (allMilestonesResolved(goal.milestones)) {
        const outcome = goal.milestones.some(m => m.completion === true) ? 'mixed' : 'lost';
        await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, outcome);
        goal.status = GoalStatus.completed;
        await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();
        console.log(`Goal ${goalId} fully resolved. Outcome: ${outcome}`);
      } else {
        await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, 'lost');
        await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();
      }
    } catch (err) {
      console.error('Error processing SQS record', err);
      throw err; // rethrow so SQS retries
    }
  }
};
