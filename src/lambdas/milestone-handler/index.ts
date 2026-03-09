import { SQSEvent } from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { Goal, GoalStatus } from '../../common/models';
import {
  allMilestonesResolved,
  buildTransactionEntries,
  updateGoalStatus,
  writeTransaction,
} from '../../common/transactionUtils';

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const eventBridge = new AWS.EventBridge();
const GOALS_TABLE = process.env.GOALS_TABLE || 'Goals';
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'Transactions';

// Triggered by SQS (EventBridge → SQS → this Lambda) at milestone deadline.
// Marks the milestone as missed if not already completed, then resolves the goal if applicable.
export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    try {
      const { goalId, milestoneId } = JSON.parse(record.body);

      if (!goalId || !milestoneId) {
        console.error('Missing goalId or milestoneId in SQS message', record.body);
        continue;
      }

      const goalResult = await dynamoDb.get({ TableName: GOALS_TABLE, Key: { goalId } }).promise();
      if (!goalResult.Item) {
        console.warn(`Goal ${goalId} not found — skipping`);
        continue;
      }

      const goal = goalResult.Item as Goal;

      // Skip if goal already resolved
      if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed) {
        console.log(`Goal ${goalId} already resolved — skipping`);
        continue;
      }

      const milestoneIndex = goal.milestones.findIndex(m => m.milestoneId === milestoneId);
      if (milestoneIndex === -1) {
        console.warn(`Milestone ${milestoneId} not found in goal ${goalId}`);
        continue;
      }

      const milestone = goal.milestones[milestoneIndex];

      // Already completed — no action needed
      if (milestone.completion === true) {
        console.log(`Milestone ${milestoneId} already completed — skipping`);
        continue;
      }

      // Mark milestone as missed
      goal.milestones[milestoneIndex] = { ...milestone, completion: false };
      goal.updatedAt = new Date().toISOString();

      // allOrNothing: any miss = immediate full failure
      if (goal.allOrNothing) {
        // Cancel all remaining EventBridge rules for this goal
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

        // Mark all remaining milestones as missed
        goal.milestones = goal.milestones.map(m =>
          m.completion !== undefined ? m : { ...m, completion: false },
        );

        const { entries, outcome } = buildTransactionEntries(goal);
        await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, outcome);

        goal.status = GoalStatus.failed;
        await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();

        console.log(`Goal ${goalId} failed (all-or-nothing): penalty applied`);
        continue;
      }

      // Non-allOrNothing: save the missed milestone, check if all resolved
      await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();

      if (allMilestonesResolved(goal.milestones)) {
        const { entries, outcome } = buildTransactionEntries(goal);
        await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, outcome);

        const finalStatus = GoalStatus.completed;
        await updateGoalStatus(dynamoDb, GOALS_TABLE, goalId, finalStatus);
        console.log(`Goal ${goalId} fully resolved. Outcome: ${outcome}`);
      }
    } catch (err) {
      console.error('Error processing SQS record', err);
      throw err; // rethrow so SQS retries
    }
  }
};