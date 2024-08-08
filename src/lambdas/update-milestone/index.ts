import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getApiResponse, milestoneSchema, convertToCronExpression } from '../../common/helpers'; // Adjust the path as necessary
import * as yup from 'yup';
import { Rule, RuleStatus } from '../../common/models'; // Adjust the path as necessary
import { v4 as uuidv4 } from 'uuid';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';
const LAMBDA_FUNCTION_ARN = process.env.LAMBDA_FUNCTION_ARN || '';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const ruleId = event.pathParameters?.ruleId;
    const milestoneId = event.pathParameters?.milestoneId;

    if (!ruleId || !milestoneId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing ruleId or milestoneId in path parameters' }));
    }

    const requestBody = JSON.parse(event.body || '{}');
    const updatedMilestone = requestBody.milestone;

    if (!updatedMilestone) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone data is required' }));
    }

    // Validate the updated milestone
    try {
      await milestoneSchema.validate(updatedMilestone, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Milestone validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    // Fetch the existing rule from DynamoDB
    const params = {
      TableName: TABLE_NAME,
      Key: { ruleId },
    };
    const existingRule = await dynamoDb.get(params).promise();

    if (!existingRule.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const rule = existingRule.Item as Rule;

    // Ensure the rule is not completed
    if (rule.status === RuleStatus.completed) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot update milestone in a completed rule' }));
    }

    // Find the milestone to update
    const milestoneIndex = rule.milestones.findIndex(m => m.milestoneId === milestoneId);

    if (milestoneIndex === -1) {
      return getApiResponse(404, JSON.stringify({ message: 'Milestone not found' }));
    }

    // Update the milestone with new data
    const originalMilestone = rule.milestones[milestoneIndex];
    const newMilestone = { ...originalMilestone, ...updatedMilestone, milestoneId }; // Preserve milestoneId

    // Ensure the milestone's deadline is within the rule's deadline
    if (new Date(newMilestone.milestoneDeadline) > new Date(rule.deadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline cannot be past the rule deadline' }));
    }

    // Ensure the milestone's deadline is unique
    if (rule.milestones.some(m => m.milestoneDeadline === newMilestone.milestoneDeadline && m.milestoneId !== milestoneId)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline must be unique' }));
    }

    rule.milestones[milestoneIndex] = newMilestone;

    // Sort milestones by deadline and update counters
    rule.milestones.sort((a, b) => new Date(a.milestoneDeadline).getTime() - new Date(b.milestoneDeadline).getTime());
    rule.milestones.forEach((m, index) => {
        if (!m.milestoneId) {
          m.milestoneId = uuidv4();
        }
        m.milestoneCounter = index + 1;
      });

    // Recalculate the total amount for the rule
    rule.totalAmount = rule.milestones.reduce((total, m) => total + m.monetaryValue, 0);
    rule.updatedAt = new Date().toISOString();

    const updateParams = {
      TableName: TABLE_NAME,
      Item: rule,
    };

    // Save the updated rule to DynamoDB
    await dynamoDb.put(updateParams).promise();

    // Create EventBridge rule for the updated milestone
    const milestoneRuleName = `MilestoneRule_${milestoneId}`;
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
        Input: JSON.stringify({ ruleId, milestoneId }),
      }],
    }).promise();

    return getApiResponse(200, JSON.stringify(rule));
  } catch (error) {
    console.error('Error updating milestone:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};