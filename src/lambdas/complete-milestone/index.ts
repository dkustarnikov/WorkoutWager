import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { Goal, GoalStatus } from '../../common/models';
import {
  allMilestonesResolved,
  buildTransactionEntries,
  computeCompletionPercentage,
  updateGoalStatus,
  writeTransaction,
} from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const GOALS_TABLE = process.env.GOALS_TABLE || 'Goals';
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'Transactions';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    const milestoneId = event.pathParameters?.milestoneId;

    if (!goalId || !milestoneId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId or milestoneId' }));
    }

    const goalResult = await dynamoDb.get({ TableName: GOALS_TABLE, Key: { goalId } }).promise();
    if (!goalResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Goal not found' }));
    }

    const goal = goalResult.Item as Goal;

    if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed) {
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

    // Mark milestone as completed
    milestone.completion = true;
    goal.milestones[index] = milestone;
    goal.updatedAt = new Date().toISOString();

    // Cancel EventBridge rule for this milestone
    const milestoneRuleName = `MilestoneRule_${milestoneId}`;
    try {
      await eventBridge.removeTargets({ Rule: milestoneRuleName, Ids: [milestoneRuleName] }).promise();
      await eventBridge.deleteRule({ Name: milestoneRuleName }).promise();
    } catch {
      // ok if rule doesn't exist
    }

    // Check if all milestones are now resolved
    if (allMilestonesResolved(goal.milestones)) {
      // Write transaction record
      const { entries, outcome } = buildTransactionEntries(goal);
      await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, goal, entries, outcome);

      // Update goal status
      const finalStatus = outcome === 'penalty' ? GoalStatus.failed : GoalStatus.completed;
      goal.status = finalStatus;
      await dynamoDb.put({ TableName: GOALS_TABLE, Item: goal }).promise();
      await updateGoalStatus(dynamoDb, GOALS_TABLE, goalId, finalStatus);

      return getApiResponse(200, JSON.stringify({
        message: 'Milestone completed — goal resolved',
        outcome,
        completionPercentage: computeCompletionPercentage(goal.milestones),
        goal,
      }));
    }

    // Not all resolved yet — save and return
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