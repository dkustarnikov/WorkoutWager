import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as yup from 'yup';
import { getCallerId, goalNotFoundResponse, isOwner, unauthorizedResponse } from '../../common/auth';
import { convertToCronExpression, getApiResponse, goalSchema } from '../../common/helpers';
import { Goal, GoalStatus, Milestone } from '../../common/models';
import {
  adjustEscrow,
  allocateMilestoneStakes,
  computeCompletionPercentage,
  InsufficientBalanceError,
} from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';
const USER_INFO_TABLE = process.env.USER_INFO_TABLE || 'UserInfo';
const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN || '';

/**
 * PUT /goal/{goalId} — replace a goal's details, milestones and stake.
 * Only allowed while the goal is still `created` (no milestone resolved yet), because the
 * stake is escrowed; a changed stake escrows or releases the difference.
 */
export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    if (!goalId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId in path parameters' }));
    }

    const callerId = getCallerId(event);
    if (!callerId) {
      return unauthorizedResponse();
    }

    const requestBody = JSON.parse(event.body || '{}');
    try {
      await goalSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    const {
      goalType, goalName, generalObjective, deadline, milestones,
      allOrNothing = false,
      stake,
    } = requestBody;

    if (new Date(deadline) <= new Date()) {
      return getApiResponse(400, JSON.stringify({ message: 'Goal deadline must be in the future' }));
    }

    const getResult = await dynamoDb.get({ TableName: TABLE_NAME, Key: { goalId } }).promise();
    if (!isOwner(getResult.Item as Goal | undefined, callerId)) {
      return goalNotFoundResponse();
    }
    const existingGoal = getResult.Item as Goal;

    if (existingGoal.status === GoalStatus.completed || existingGoal.status === GoalStatus.failed
      || existingGoal.status === GoalStatus.cancelled) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot update a resolved goal' }));
    }
    if (existingGoal.status !== GoalStatus.created) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot change stake after goal has started; cancel and recreate' }));
    }
    if (existingGoal.milestones.some(m => m.completion !== undefined)) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot update stakes after milestones have been resolved' }));
    }

    let stakeAllocations: number[];
    try {
      stakeAllocations = allocateMilestoneStakes(stake, milestones.length > 0 ? milestones : [{ stake }]);
    } catch (allocError) {
      return getApiResponse(400, JSON.stringify({ message: allocError instanceof Error ? allocError.message : 'Invalid milestone stakes' }));
    }

    // `completion` is owned by the server: never taken from the request.
    const updatedMilestones: Milestone[] = milestones.map((m: Partial<Milestone>, index: number) => ({
      milestoneId: m.milestoneId || uuidv4(),
      milestoneName: m.milestoneName as string,
      type: m.type as string,
      milestoneCounter: index + 1,
      milestoneDeadline: m.milestoneDeadline as string,
      stake: stakeAllocations[index],
    }));

    const lastMilestone = updatedMilestones[updatedMilestones.length - 1];
    if (!lastMilestone || lastMilestone.milestoneDeadline !== deadline) {
      return getApiResponse(400, JSON.stringify({ message: 'Last milestone deadline must match the goal deadline' }));
    }

    try {
      await adjustEscrow(dynamoDb, USER_INFO_TABLE, existingGoal.userId, stake - existingGoal.stake);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return getApiResponse(400, JSON.stringify({ message: err.message }));
      }
      throw err;
    }

    const updatedGoal: Goal = {
      ...existingGoal,
      goalType,
      goalName,
      generalObjective,
      deadline,
      milestones: updatedMilestones,
      allOrNothing,
      stake,
      updatedAt: new Date().toISOString(),
    };
    await dynamoDb.put({ TableName: TABLE_NAME, Item: updatedGoal }).promise();

    // Remove rules for milestones that were dropped, then (re)schedule the current ones.
    const keptIds = new Set(updatedMilestones.map(m => m.milestoneId));
    for (const old of existingGoal.milestones.filter(m => !keptIds.has(m.milestoneId))) {
      const ruleName = `MilestoneRule_${old.milestoneId}`;
      try {
        await eventBridge.removeTargets({ Rule: ruleName, Ids: [ruleName] }).promise();
        await eventBridge.deleteRule({ Name: ruleName }).promise();
      } catch {
        // already gone
      }
    }
    for (const milestone of updatedMilestones) {
      const milestoneRuleName = `MilestoneRule_${milestone.milestoneId}`;
      await eventBridge.putRule({
        Name: milestoneRuleName,
        ScheduleExpression: `cron(${convertToCronExpression(milestone.milestoneDeadline)})`,
        State: 'ENABLED',
      }).promise();
      await eventBridge.putTargets({
        Rule: milestoneRuleName,
        Targets: [{
          Id: milestoneRuleName,
          Arn: SQS_QUEUE_ARN,
          Input: JSON.stringify({ goalId, milestoneId: milestone.milestoneId, userId: updatedGoal.userId }),
        }],
      }).promise();
    }

    return getApiResponse(200, JSON.stringify({
      ...updatedGoal,
      completionPercentage: computeCompletionPercentage(updatedMilestones),
    }));
  } catch (error) {
    console.error('Error updating goal:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
