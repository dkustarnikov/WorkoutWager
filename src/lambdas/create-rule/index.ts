import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { convertToCronExpression, getApiResponse, ruleSchema } from '../../common/helpers';
import { Rule, Milestone } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';
const LAMBDA_FUNCTION_ARN = process.env.LAMBDA_FUNCTION_ARN || '';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const requestBody = JSON.parse(event.body || '{}');

    try {
      await ruleSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof Error) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: (validationError as any).errors }));
      }
      throw validationError;
    }

    const { userId, ruleType, ruleName, generalObjective, totalAmount, deadline, milestones = [], status } = requestBody;

    if (new Date(deadline) <= new Date()) {
      return getApiResponse(400, JSON.stringify({ message: 'Rule deadline must be in the future' }));
    }

    let calculatedAmount = 0;
    const processedMilestones: Milestone[] = milestones.length > 0
      ? milestones.map((m: Milestone, index: number) => {
        calculatedAmount += m.monetaryValue;
        return {
          ...m,
          milestoneId: m.milestoneId || uuidv4(),
          milestoneCounter: index + 1,
          completion: false,
        };
      })
      : [{
        milestoneId: uuidv4(),
        milestoneName: 'Week 1',
        type: 'common',
        completion: false,
        milestoneCounter: 1,
        milestoneDeadline: deadline,
        monetaryValue: totalAmount ?? 0,
      }];

    if (milestones.length > 0 && calculatedAmount !== totalAmount) {
      return getApiResponse(400, JSON.stringify({ message: 'Total monetary value of milestones does not match total amount of the rule' }));
    }

    const lastDeadline = processedMilestones[processedMilestones.length - 1].milestoneDeadline;
    if (lastDeadline !== deadline) {
      return getApiResponse(400, JSON.stringify({ message: 'Last milestone deadline must match the rule deadline' }));
    }

    const now = new Date().toISOString();
    const ruleId = uuidv4();
    const newRule: Rule = {
      ruleId,
      userId,
      ruleType,
      ruleName,
      generalObjective,
      totalAmount,
      deadline,
      milestones: processedMilestones,
      createdAt: now,
      updatedAt: now,
      status,
    };

    await dynamoDb.put({ TableName: TABLE_NAME, Item: newRule }).promise();

    // Schedule each milestone with EventBridge
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
          Arn: LAMBDA_FUNCTION_ARN,
          Input: JSON.stringify({ userId, milestone }),
        }],
      }).promise();
    }

    return getApiResponse(201, JSON.stringify(newRule));
  } catch (error) {
    console.error('Error creating rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};
// This code is an AWS Lambda function that creates a new rule in a DynamoDB table.
// It validates the rule data using Yup, checks for deadlines, and processes milestones.
// If successful, it schedules the milestones using EventBridge and returns the created rule; otherwise, it returns an error response.