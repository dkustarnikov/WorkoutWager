import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as yup from 'yup';
import { getApiResponse, milestoneSchema, convertToCronExpression } from '../../common/helpers';
import { Goal, GoalStatus } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';
const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN || '';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const goalId = event.pathParameters?.goalId;
    if (!goalId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing goalId in path parameters' }));
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
    if (!goalResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Goal not found' }));
    }

    const goal = goalResult.Item as Goal;
    goal.milestones = goal.milestones || [];

    if (goal.status === GoalStatus.completed || goal.status === GoalStatus.failed) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot add milestone to a resolved goal' }));
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

    newMilestone.milestoneId = newMilestone.milestoneId || uuidv4();
    delete newMilestone.completion;

    goal.milestones.push(newMilestone);
    goal.milestones.sort((a, b) => new Date(a.milestoneDeadline).getTime() - new Date(b.milestoneDeadline).getTime());

    goal.milestones.forEach((m, index) => {
      m.milestoneCounter = index + 1;
      m.milestoneId ||= uuidv4();
    });

    goal.totalAmount = goal.milestones.reduce((sum, m) => sum + m.monetaryValue, 0);
    goal.updatedAt = new Date().toISOString();

    await dynamoDb.put({ TableName: TABLE_NAME, Item: goal }).promise();

    const milestoneRuleName = `MilestoneRule_${newMilestone.milestoneId}`;
    const scheduleExpression = `cron(${convertToCronExpression(newMilestone.milestoneDeadline)})`;

    await eventBridge.putRule({
      Name: milestoneRuleName,
      ScheduleExpression: scheduleExpression,
      State: 'ENABLED',
    }).promise();

    await eventBridge.putTargets({
      Rule: milestoneRuleName,
      Targets: [{
        Id: milestoneRuleName,
        Arn: SQS_QUEUE_ARN,
        Input: JSON.stringify({ goalId, milestoneId: newMilestone.milestoneId, userId: goal.userId }),
      }],
    }).promise();

    return getApiResponse(200, JSON.stringify(goal));
  } catch (err) {
    console.error('Error in add-milestone:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};