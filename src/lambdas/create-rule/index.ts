import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { getCallerId, unauthorizedResponse } from '../../common/auth';
import { convertToCronExpression, getApiResponse, goalSchema } from '../../common/helpers';
import { Goal, GoalStatus, Milestone } from '../../common/models';
import {
  allocateMilestoneStakes,
  computeCompletionPercentage,
  escrowStake,
  InsufficientBalanceError,
  releaseStake,
  writeTransaction,
} from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';
const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE || 'Transactions';
const USER_INFO_TABLE = process.env.USER_INFO_TABLE || 'UserInfo';
const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN || '';

/** POST /goal — create a goal and escrow its stake from the caller's balance. */
export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const userId = getCallerId(event);
    if (!userId) {
      return unauthorizedResponse();
    }

    const requestBody = JSON.parse(event.body || '{}');
    try {
      await goalSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof Error) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: (validationError as any).errors }));
      }
      throw validationError;
    }

    const {
      goalType, goalName, generalObjective, deadline,
      milestones = [],
      allOrNothing = false,
      stake,
    } = requestBody;

    if (new Date(deadline) <= new Date()) {
      return getApiResponse(400, JSON.stringify({ message: 'Goal deadline must be in the future' }));
    }

    let stakeAllocations: number[];
    try {
      stakeAllocations = allocateMilestoneStakes(stake, milestones.length > 0 ? milestones : [{ stake }]);
    } catch (allocError) {
      return getApiResponse(400, JSON.stringify({ message: allocError instanceof Error ? allocError.message : 'Invalid milestone stakes' }));
    }

    // New milestones always start pending — `completion` is never taken from the client.
    const processedMilestones: Milestone[] = milestones.length > 0
      ? milestones.map((m: Partial<Milestone>, index: number) => ({
        milestoneId: m.milestoneId || uuidv4(),
        milestoneName: m.milestoneName as string,
        type: m.type as string,
        milestoneCounter: index + 1,
        milestoneDeadline: m.milestoneDeadline as string,
        stake: stakeAllocations[index],
      }))
      : [{
        milestoneId: uuidv4(),
        milestoneName: 'Week 1',
        type: 'common',
        milestoneCounter: 1,
        milestoneDeadline: deadline,
        stake: stakeAllocations[0],
      }];

    const lastDeadline = processedMilestones[processedMilestones.length - 1].milestoneDeadline;
    if (lastDeadline !== deadline) {
      return getApiResponse(400, JSON.stringify({ message: 'Last milestone deadline must match the goal deadline' }));
    }

    try {
      await escrowStake(dynamoDb, USER_INFO_TABLE, userId, stake);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return getApiResponse(400, JSON.stringify({ message: err.message }));
      }
      throw err;
    }

    const now = new Date().toISOString();
    const goalId = uuidv4();
    const newGoal: Goal = {
      goalId,
      userId,
      goalType,
      goalName,
      generalObjective,
      deadline,
      milestones: processedMilestones,
      allOrNothing,
      stake,
      createdAt: now,
      updatedAt: now,
      status: GoalStatus.created,
    };

    try {
      await dynamoDb.put({ TableName: TABLE_NAME, Item: newGoal }).promise();
    } catch (err) {
      // Don't leave the stake stranded in pendingBalance if the goal was never saved.
      await releaseStake(dynamoDb, USER_INFO_TABLE, userId, stake).catch(releaseErr =>
        console.error('Failed to release escrow after goal save failed:', releaseErr));
      throw err;
    }

    await writeTransaction(dynamoDb, TRANSACTIONS_TABLE, newGoal, [
      { type: 'escrow', amount: stake, reason: 'Goal created — stake locked from balance into pending' },
    ], 'escrowed');

    // Schedule each milestone deadline: EventBridge → SQS → milestone-handler
    for (const milestone of processedMilestones) {
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
          Input: JSON.stringify({ goalId, milestoneId: milestone.milestoneId, userId }),
        }],
      }).promise();
    }

    return getApiResponse(201, JSON.stringify({
      ...newGoal,
      completionPercentage: computeCompletionPercentage(processedMilestones),
    }));
  } catch (error) {
    console.error('Error creating goal:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
