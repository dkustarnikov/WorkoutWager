import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import * as yup from 'yup';
import { getApiResponse, milestoneSchema, convertToCronExpression } from '../../common/helpers';
import { Rule, RuleStatus } from '../../common/models';

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

    const ruleResult = await dynamoDb.get({ TableName: TABLE_NAME, Key: { ruleId } }).promise();
    if (!ruleResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const rule = ruleResult.Item as Rule;
    rule.milestones = rule.milestones || [];

    if (rule.status === RuleStatus.completed) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot add milestone to a completed rule' }));
    }

    if (new Date(newMilestone.milestoneDeadline) > new Date(rule.deadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline cannot be past the rule deadline' }));
    }

    if (rule.milestones.some(m => m.milestoneDeadline === newMilestone.milestoneDeadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline must be unique' }));
    }

    if (rule.milestones.some(m => m.milestoneName === newMilestone.milestoneName)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone name must be unique' }));
    }

    newMilestone.milestoneId = newMilestone.milestoneId || uuidv4();
    rule.milestones.push(newMilestone);
    rule.milestones.sort((a, b) => new Date(a.milestoneDeadline).getTime() - new Date(b.milestoneDeadline).getTime());

    rule.milestones.forEach((m, index) => {
      m.milestoneCounter = index + 1;
      m.milestoneId ||= uuidv4();
    });

    rule.totalAmount = rule.milestones.reduce((sum, m) => sum + m.monetaryValue, 0);
    rule.updatedAt = new Date().toISOString();

    await dynamoDb.put({ TableName: TABLE_NAME, Item: rule }).promise();

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
        Arn: LAMBDA_FUNCTION_ARN,
        Input: JSON.stringify({ userId: rule.userId, milestone: newMilestone }),
      }],
    }).promise();

    return getApiResponse(200, JSON.stringify(rule));
  } catch (err) {
    console.error('Error in add-milestone:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};

// This code is an AWS Lambda function that adds a milestone to an existing rule in a DynamoDB table.
// It validates the milestone using Yup, checks for uniqueness of deadlines and names, and updates the rule's total amount.
// If successful, it schedules the milestone using EventBridge and returns the updated rule; otherwise, it returns an error response.