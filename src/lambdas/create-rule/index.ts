import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { convertToCronExpression, getApiResponse, goalSchema } from '../../common/helpers';
import { Goal, GoalStatus, Milestone } from '../../common/models';
import { computeCompletionPercentage } from '../../common/transactionUtils';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.GOALS_TABLE || 'Goals';
const SQS_QUEUE_ARN = process.env.SQS_QUEUE_ARN || '';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
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
      userId, goalType, goalName, generalObjective, totalAmount, deadline,
      milestones = [],
      allOrNothing = false,
      rewardDestination = 'savings',
      penaltyDestination = 'savings',
      penaltyInterestRate = 0,
    } = requestBody;

    if (new Date(deadline) <= new Date()) {
      return getApiResponse(400, JSON.stringify({ message: 'Goal deadline must be in the future' }));
    }

    let calculatedAmount = 0;
    const processedMilestones: Milestone[] = milestones.length > 0
      ? milestones.map((m: Milestone, index: number) => {
        calculatedAmount += m.monetaryValue;
        return {
          ...m,
          milestoneId: m.milestoneId || uuidv4(),
          milestoneCounter: index + 1,
        };
      })
      : [{
        milestoneId: uuidv4(),
        milestoneName: 'Week 1',
        type: 'common',
        milestoneCounter: 1,
        milestoneDeadline: deadline,
        monetaryValue: totalAmount ?? 0,
      }];

    if (milestones.length > 0 && calculatedAmount !== totalAmount) {
      return getApiResponse(400, JSON.stringify({ message: 'Total monetary value of milestones does not match total amount of the goal' }));
    }

    const lastDeadline = processedMilestones[processedMilestones.length - 1].milestoneDeadline;
    if (lastDeadline !== deadline) {
      return getApiResponse(400, JSON.stringify({ message: 'Last milestone deadline must match the goal deadline' }));
    }

    const now = new Date().toISOString();
    const goalId = uuidv4();
    const newGoal: Goal = {
      goalId,
      userId,
      goalType,
      goalName,
      generalObjective,
      totalAmount,
      deadline,
      milestones: processedMilestones,
      allOrNothing,
      rewardDestination,
      penaltyDestination,
      penaltyInterestRate,
      createdAt: now,
      updatedAt: now,
      status: GoalStatus.created,
    };

    await dynamoDb.put({ TableName: TABLE_NAME, Item: newGoal }).promise();

    // Schedule each milestone: EventBridge → SQS → milestone-handler
    for (const milestone of processedMilestones) {
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
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};