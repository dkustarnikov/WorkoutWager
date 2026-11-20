import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as yup from 'yup';
import { getCallerId, goalNotFoundResponse, isOwner, unauthorizedResponse } from '../../common/auth';
import { convertToCronExpression, getApiResponse, milestoneSchema } from '../../common/helpers';
import { Goal, GoalStatus } from '../../common/models';
import { allocateMilestoneStakes } from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';
const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN || '';

/**
 * POST /goal/{goalId}/milestone — add a milestone before the goal starts.
 * The goal stake doesn't change; it is re-split across all milestones (or the explicit
 * stakes are used if the new milestone has one).
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
    const newMilestone = requestBody.milestone;
    if (!newMilestone) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing milestone in request body' }));
    }

    try {
      await milestoneSchema.validate(newMilestone, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Milestone validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    const goalResult = await dynamoDb.get({ TableName: TABLE_NAME, Key: { goalId } }).promise();
    if (!isOwner(goalResult.Item as Goal | undefined, callerId)) {
      return goalNotFoundResponse();
    }
    const goal = goalResult.Item as Goal;
    goal.milestones = goal.milestones || [];

    if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed || goal.status === GoalStatus.cancelled) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot add milestone to a resolved goal' }));
    }
    if (goal.status !== GoalStatus.created) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot add milestones after goal has started' }));
    }
    if (goal.milestones.some(m => m.completion !== undefined)) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot add milestones after any have been resolved' }));
    }
    if (new Date(newMilestone.milestoneDeadline) > new Date(goal.deadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline cannot be past the goal deadline' }));
    }
    if (goal.milestones.some(m => m.milestoneDeadline === newMilestone.milestoneDeadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline must be unique' }));
    }
    if (goal.milestones.some(m => m.milestoneName === newMilestone.milestoneName)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone name must be unique' }));
    }

    const milestoneId: string = newMilestone.milestoneId || uuidv4();
    const explicitStake = typeof newMilestone.stake === 'number';
    const combined = [
      ...goal.milestones.map(m => ({
        milestoneId: m.milestoneId,
        milestoneName: m.milestoneName,
        type: m.type,
        milestoneDeadline: m.milestoneDeadline,
        stake: explicitStake ? m.stake : undefined,
      })),
      {
        milestoneId,
        milestoneName: newMilestone.milestoneName as string,
        type: newMilestone.type as string,
        milestoneDeadline: newMilestone.milestoneDeadline as string,
        stake: newMilestone.stake as number | undefined,
      },
    ].sort((a, b) => new Date(a.milestoneDeadline).getTime() - new Date(b.milestoneDeadline).getTime());

    let stakes: number[];
    try {
      stakes = allocateMilestoneStakes(goal.stake, combined);
    } catch (allocError) {
      return getApiResponse(400, JSON.stringify({ message: allocError instanceof Error ? allocError.message : 'Invalid milestone stakes' }));
    }

    goal.milestones = combined.map((m, index) => ({
      milestoneId: m.milestoneId,
      milestoneName: m.milestoneName,
      type: m.type,
      milestoneDeadline: m.milestoneDeadline,
      milestoneCounter: index + 1,
      stake: stakes[index],
    }));
    goal.updatedAt = new Date().toISOString();

    await dynamoDb.put({ TableName: TABLE_NAME, Item: goal }).promise();

    const milestoneRuleName = `MilestoneRule_${milestoneId}`;
    await eventBridge.putRule({
      Name: milestoneRuleName,
      ScheduleExpression: `cron(${convertToCronExpression(newMilestone.milestoneDeadline)})`,
      State: 'ENABLED',
    }).promise();
    await eventBridge.putTargets({
      Rule: milestoneRuleName,
      Targets: [{
        Id: milestoneRuleName,
        Arn: SQS_QUEUE_ARN,
        Input: JSON.stringify({ goalId, milestoneId, userId: goal.userId }),
      }],
    }).promise();

    return getApiResponse(200, JSON.stringify(goal));
  } catch (err) {
    console.error('Error in add-milestone:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
