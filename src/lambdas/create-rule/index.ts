import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { convertToCronExpression, getApiResponse, ruleSchema } from '../../common/helpers'; // Adjust the path as necessary
import { Rule } from '../../common/models';
import * as yup from 'yup';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';
const LAMBDA_FUNCTION_ARN = process.env.LAMBDA_FUNCTION_ARN || '';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const requestBody = JSON.parse(event.body || '{}');

    console.log('The LAMBDA_FUNCTION_ARN', LAMBDA_FUNCTION_ARN);

    // Validate the request body against the schema
    try {
      await ruleSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: validationError.errors }));
      }
      throw validationError; // rethrow if it's not a validation error
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
        monetaryValue: totalAmount | 0
      }];
    }

    // Ensure the last milestone deadline matches the rule deadline
    const lastMilestone = updatedMilestones[updatedMilestones.length - 1];
    if (lastMilestone.milestoneDeadline !== deadline) {
      return getApiResponse(400, JSON.stringify({ message: 'Last milestone deadline must match the rule deadline' }));
    }

    const ruleId = uuidv4();
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const newRule: Rule = {
      ruleId,
      userId,
      ruleType,
      ruleName,
      generalObjective,
      totalAmount,
      deadline,
      milestones: updatedMilestones,
      createdAt,
      updatedAt,
      status
    };

    const params = {
      TableName: TABLE_NAME,
      Item: newRule,
    };

    await dynamoDb.put(params).promise();

    // Create EventBridge rules for each milestone
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
        Input: JSON.stringify({ userId: newRule.userId, milestone: milestone }),
      }],
    }).promise();
    }

    return getApiResponse(201, JSON.stringify(newRule));
  } catch (error) {
    console.error('Error creating rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};