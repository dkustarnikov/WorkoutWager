import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import * as yup from 'yup';
import { getApiResponse, milestoneSchema, convertToCronExpression } from '../../common/helpers';
import { Goal, GoalStatus, Milestone } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';
const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN || '';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    const milestoneId = event.pathParameters?.milestoneId;

    if (!goalId || !milestoneId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId or milestoneId in path parameters' }));
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
    if (!goalResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Goal not found' }));
    }

    const goal = goalResult.Item as Goal;

    if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot update milestone in a resolved goal' }));
    }

    const index = goal.milestones.findIndex(m => m.milestoneId === milestoneId);
    if (index === -1) {
      return getApiResponse(404, JSON.stringify({ message: 'Milestone not found' }));
    }

    const original = goal.milestones[index];
    const updatedMilestone: Milestone = {
      ...original,
      ...updatedMilestoneData,
      milestoneId,
      milestoneCounter: original.milestoneCounter,
      completion: original.completion,
    };

    if (new Date(updatedMilestone.milestoneDeadline) > new Date(goal.deadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline cannot be past the goal deadline' }));
    }

    if (goal.milestones.some(m => m.milestoneDeadline === updatedMilestone.milestoneDeadline && m.milestoneId !== milestoneId)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline must be unique' }));
    }

    const deadlineChanged = updatedMilestone.milestoneDeadline !== original.milestoneDeadline;

    goal.milestones[index] = updatedMilestone;
    goal.milestones.sort((a, b) => new Date(a.milestoneDeadline).getTime() - new Date(b.milestoneDeadline).getTime());
    goal.milestones.forEach((m, i) => { m.milestoneCounter = i + 1; });

    goal.totalAmount = goal.milestones.reduce((sum, m) => sum + m.monetaryValue, 0);
    goal.updatedAt = new Date().toISOString();

    await dynamoDb.put({ TableName: TABLE_NAME, Item: goal }).promise();

    if (deadlineChanged) {
      const milestoneRuleName = `MilestoneRule_${milestoneId}`;
      const cronExpression = convertToCronExpression(updatedMilestone.milestoneDeadline);

      await eventBridge.removeTargets({ Rule: milestoneRuleName, Ids: [milestoneRuleName] }).promise();
      await eventBridge.deleteRule({ Name: milestoneRuleName }).promise();

      await eventBridge.putRule({
        Name: milestoneRuleName,
        ScheduleExpression: `cron(${cronExpression})`,
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