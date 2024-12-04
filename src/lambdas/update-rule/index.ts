import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as yup from 'yup';
import { getApiResponse, ruleSchema, convertToCronExpression } from '../../common/helpers'; // Adjust the path as necessary
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

    // Validate the request body against the schema
    try {
      await ruleSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    const { userId, ruleType, ruleName, generalObjective, totalAmount, deadline, milestones, status } = requestBody;

    // Ensure the rule deadline is in the future
    if (new Date(deadline) <= new Date()) {
      return getApiResponse(400, JSON.stringify({ message: 'Rule deadline must be in the future' }));
    }

    // Validate milestones total monetary value
    let calculatedTotalAmount = 0;
    for (const milestone of milestones) {
      calculatedTotalAmount += milestone.monetaryValue;
      if (!milestone.milestoneId) {
        milestone.milestoneId = uuidv4();
      }
    }

    if (calculatedTotalAmount !== totalAmount) {
      return getApiResponse(400, JSON.stringify({ message: 'Total monetary value of milestones does not match total amount of the rule' }));
    }

    // Ensure there is at least one milestone
    let updatedMilestones = milestones;
    if (updatedMilestones.length === 0) {
      updatedMilestones = [{
        milestoneName: 'Week 1',
        type: 'common',
        completion: false,
        milestoneCounter: 1,
        milestoneDeadline: deadline,
        monetaryValue: 0,
      }];
    }

    // Ensure the last milestone deadline matches the rule deadline
    const lastMilestone = updatedMilestones[updatedMilestones.length - 1];
    if (lastMilestone.milestoneDeadline !== deadline) {
      return getApiResponse(400, JSON.stringify({ message: 'Last milestone deadline must match the rule deadline' }));
    }

    const existingRule = await dynamoDb.get({ TableName: TABLE_NAME, Key: { ruleId } }).promise();
    if (!existingRule.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const rule = existingRule.Item as Rule;

    const updatedRule: Rule = {
      ...rule,
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

    const updateParams = {
      TableName: TABLE_NAME,
      Item: updatedRule,
    };

    // Save the updated rule to DynamoDB
    await dynamoDb.put(updateParams).promise();

    // Create EventBridge rules for each milestone
    for (const milestone of updatedRule.milestones) {
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
          Input: JSON.stringify({ userId: rule.userId, milestone: milestone }),
        }],
      }).promise();
    }

    return getApiResponse(200, JSON.stringify(updatedRule));
  } catch (error) {
    console.error('Error updating rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};
