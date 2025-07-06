import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as yup from 'yup';
import { getApiResponse, ruleSchema, convertToCronExpression } from '../../common/helpers';
import { Rule } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';
const LAMBDA_FUNCTION_ARN = process.env.LAMBDA_FUNCTION_ARN || '';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing ruleId in path parameters' }));
    }

    const requestBody = JSON.parse(event.body || '{}');

    try {
      await ruleSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    const { userId, ruleType, ruleName, generalObjective, totalAmount, deadline, milestones, status } = requestBody;

    if (new Date(deadline) <= new Date()) {
      return getApiResponse(400, JSON.stringify({ message: 'Rule deadline must be in the future' }));
    }

    let calculatedTotal = 0;
    const updatedMilestones = milestones.map((m: { monetaryValue: number; milestoneId: any }, index: number) => {
      calculatedTotal += m.monetaryValue;
      return {
        ...m,
        milestoneId: m.milestoneId || uuidv4(),
        milestoneCounter: index + 1,
      };
    });

    if (calculatedTotal !== totalAmount) {
      return getApiResponse(400, JSON.stringify({ message: 'Total monetary value of milestones does not match total amount of the rule' }));
    }

    const lastMilestone = updatedMilestones[updatedMilestones.length - 1];
    if (lastMilestone.milestoneDeadline !== deadline) {
      return getApiResponse(400, JSON.stringify({ message: 'Last milestone deadline must match the rule deadline' }));
    }

    const getResult = await dynamoDb.get({ TableName: TABLE_NAME, Key: { ruleId } }).promise();
    if (!getResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const existingRule = getResult.Item as Rule;

    const updatedRule: Rule = {
      ...existingRule,
      userId,
      ruleType,
      ruleName,
      generalObjective,
      totalAmount,
      deadline,
      milestones: updatedMilestones,
      status,
      updatedAt: new Date().toISOString(),
    };

    await dynamoDb.put({ TableName: TABLE_NAME, Item: updatedRule }).promise();

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
          Arn: LAMBDA_FUNCTION_ARN,
          Input: JSON.stringify({ userId: updatedRule.userId, milestone }),
        }],
      }).promise();
    }

    return getApiResponse(200, JSON.stringify(updatedRule));
  } catch (error) {
    console.error('Error updating rule:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
// This code is an AWS Lambda function that updates an existing rule in a DynamoDB table.
// It validates the input using Yup, checks for the uniqueness of milestones, and updates the rule's total amount.
// If successful, it updates the EventBridge rules for each milestone and returns the updated rule; otherwise, it returns an error response.