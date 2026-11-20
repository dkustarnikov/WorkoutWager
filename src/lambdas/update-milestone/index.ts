import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import * as yup from 'yup';
import { getCallerId, goalNotFoundResponse, isOwner, unauthorizedResponse } from '../../common/auth';
import { convertToCronExpression, getApiResponse, milestoneSchema } from '../../common/helpers';
import { Goal, GoalStatus, Milestone } from '../../common/models';
import { allocateMilestoneStakes } from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';
const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN || '';

/**
 * PUT /goal/{goalId}/milestone/{milestoneId} — edit a milestone before the goal starts.
 * Completion state is always preserved; a changed deadline reschedules its rule.
 */
export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    const milestoneId = event.pathParameters?.milestoneId;
    if (!goalId || !milestoneId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId or milestoneId in path parameters' }));
    }

    const callerId = getCallerId(event);
    if (!callerId) {
      return unauthorizedResponse();
    }

    const requestBody = JSON.parse(event.body || '{}');
    const updatedMilestoneData: Partial<Milestone> = requestBody.milestone;
    if (!updatedMilestoneData) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone data is required' }));
    }

    try {
      await milestoneSchema.validate(updatedMilestoneData, { abortEarly: false });
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

    if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed || goal.status === GoalStatus.cancelled) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot update milestone in a resolved goal' }));
    }
    if (goal.status !== GoalStatus.created) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot change milestones after goal has started' }));
    }

    const index = goal.milestones.findIndex(m => m.milestoneId === milestoneId);
    if (index === -1) {
      return getApiResponse(404, JSON.stringify({ message: 'Milestone not found' }));
    }

    const original = goal.milestones[index];
    const updatedMilestone: Milestone = {
      ...original,
      milestoneName: updatedMilestoneData.milestoneName ?? original.milestoneName,
      type: updatedMilestoneData.type ?? original.type,
      milestoneDeadline: updatedMilestoneData.milestoneDeadline ?? original.milestoneDeadline,
      milestoneId,
      milestoneCounter: original.milestoneCounter,
      completion: original.completion, // never taken from the request
      stake: typeof updatedMilestoneData.stake === 'number' ? updatedMilestoneData.stake : original.stake,
    };

    if (new Date(updatedMilestone.milestoneDeadline) > new Date(goal.deadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline cannot be past the goal deadline' }));
    }
    if (goal.milestones.some(m => m.milestoneDeadline === updatedMilestone.milestoneDeadline && m.milestoneId !== milestoneId)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline must be unique' }));
    }

    const deadlineChanged = updatedMilestone.milestoneDeadline !== original.milestoneDeadline;
    goal.milestones[index] = updatedMilestone;

    if (typeof updatedMilestoneData.stake === 'number') {
      try {
        const stakes = allocateMilestoneStakes(goal.stake, goal.milestones);
        goal.milestones.forEach((m, i) => {
          m.stake = stakes[i];
        });
      } catch (allocError) {
        return getApiResponse(400, JSON.stringify({ message: allocError instanceof Error ? allocError.message : 'Invalid milestone stakes' }));
      }
    }

    goal.milestones.sort((a, b) => new Date(a.milestoneDeadline).getTime() - new Date(b.milestoneDeadline).getTime());
    goal.milestones.forEach((m, i) => {
      m.milestoneCounter = i + 1;
    });
    goal.updatedAt = new Date().toISOString();

    await dynamoDb.put({ TableName: TABLE_NAME, Item: goal }).promise();

    if (deadlineChanged) {
      const milestoneRuleName = `MilestoneRule_${milestoneId}`;
      try {
        await eventBridge.removeTargets({ Rule: milestoneRuleName, Ids: [milestoneRuleName] }).promise();
        await eventBridge.deleteRule({ Name: milestoneRuleName }).promise();
      } catch {
        // rule may already be gone
      }
      await eventBridge.putRule({
        Name: milestoneRuleName,
        ScheduleExpression: `cron(${convertToCronExpression(updatedMilestone.milestoneDeadline)})`,
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
    }

    return getApiResponse(200, JSON.stringify(goal));
  } catch (err) {
    console.error('Error updating milestone:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
