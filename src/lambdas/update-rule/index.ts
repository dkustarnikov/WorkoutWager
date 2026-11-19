import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as yup from 'yup';
import { getCallerId, goalNotFoundResponse, isOwner, unauthorizedResponse } from '../../common/auth';
import { getApiResponse, goalSchema, convertToCronExpression } from '../../common/helpers';
import { Goal, GoalStatus } from '../../common/models';
import { computeCompletionPercentage } from '../../common/transactionUtils';

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

    const callerId = getCallerId(event);
    if (!callerId) {
      return unauthorizedResponse();
    }

    // Owner comes from the token; a body `userId` is ignored (kept for older clients).
    const requestBody = { ...JSON.parse(event.body || '{}'), userId: callerId };

    try {
      await goalSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    const {
      userId, goalType, goalName, generalObjective, totalAmount, deadline, milestones,
      allOrNothing = false,
      rewardDestination = 'savings',
      penaltyDestination = 'savings',
      penaltyInterestRate = 0,
    } = requestBody;

    if (new Date(deadline) <= new Date()) {
      return getApiResponse(400, JSON.stringify({ message: 'Goal deadline must be in the future' }));
    }

    let calculatedTotal = 0;
    const updatedMilestones = milestones.map((m: any, index: number) => {
      calculatedTotal += m.monetaryValue;
      return {
        ...m,
        milestoneId: m.milestoneId || uuidv4(),
        milestoneCounter: index + 1,
        completion: m.completion,
      };
    });

    if (calculatedTotal !== totalAmount) {
      return getApiResponse(400, JSON.stringify({ message: 'Total monetary value of milestones does not match total amount of the goal' }));
    }

    const lastMilestone = updatedMilestones[updatedMilestones.length - 1];
    if (lastMilestone.milestoneDeadline !== deadline) {
      return getApiResponse(400, JSON.stringify({ message: 'Last milestone deadline must match the goal deadline' }));
    }

    const getResult = await dynamoDb.get({ TableName: TABLE_NAME, Key: { goalId } }).promise();
    if (!isOwner(getResult.Item as Goal | undefined, callerId)) {
      return goalNotFoundResponse();
    }

    const existingGoal = getResult.Item as Goal;

    // Completion state is owned by the server (complete-milestone / milestone-handler).
    // Never take it from the request, or a client could mark milestones done or undo a miss.
    const storedCompletion = new Map(existingGoal.milestones.map(m => [m.milestoneId, m.completion]));
    for (const m of updatedMilestones) {
      m.completion = storedCompletion.get(m.milestoneId);
    }

    if (existingGoal.status === GoalStatus.completed || existingGoal.status === GoalStatus.failed
      || existingGoal.status === GoalStatus.cancelled) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot update a resolved goal' }));
    }

    const updatedGoal: Goal = {
      ...existingGoal,
      userId: existingGoal.userId,
      goalType,
      goalName,
      generalObjective,
      totalAmount,
      deadline,
      milestones: updatedMilestones,
      allOrNothing,
      rewardDestination,
      penaltyDestination,
      penaltyInterestRate,
      updatedAt: new Date().toISOString(),
    };

    await dynamoDb.put({ TableName: TABLE_NAME, Item: updatedGoal }).promise();

    for (const milestone of updatedMilestones) {
      const milestoneRuleName = `MilestoneRule_${milestone.milestoneId}`;
      const scheduleExpression = `cron(${convertToCronExpression(milestone.milestoneDeadline)})`;

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