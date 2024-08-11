import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { getApiResponse, milestoneSchema, convertToCronExpression } from '../../common/helpers'; // Adjust the path as necessary
import * as yup from 'yup';
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

    // Validate the new milestone
    try {
      await milestoneSchema.validate(newMilestone, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Milestone validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    const params = {
      TableName: TABLE_NAME,
      Key: { ruleId },
    };

    // Fetch the existing rule from DynamoDB
    const existingRule = await dynamoDb.get(params).promise();

    if (!existingRule.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const rule = existingRule.Item as Rule;

    // Ensure the rule is not completed
    if (rule.status === RuleStatus.completed) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot add milestone to a completed rule' }));
    }

    // Ensure the milestone's deadline is within the rule's deadline
    if (new Date(newMilestone.milestoneDeadline) > new Date(rule.deadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline cannot be past the rule deadline' }));
    }

    // Ensure the milestone's deadline is unique
    if (rule.milestones.some(m => m.milestoneDeadline === newMilestone.milestoneDeadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline must be unique' }));
    }

    // Ensure the milestone's name is unique
    if (rule.milestones.some(m => m.milestoneName === newMilestone.milestoneName)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone name must be unique' }));
    }

    // Assign a new milestoneId if not provided
    newMilestone.milestoneId = newMilestone.milestoneId || uuidv4();

    // Add the new milestone to the rule and sort by deadline
    rule.milestones.push(newMilestone);
    rule.milestones.sort((a, b) => new Date(a.milestoneDeadline).getTime() - new Date(b.milestoneDeadline).getTime());

    // Update the milestone counters based on their order
    rule.milestones.forEach((m, index) => {
      m.milestoneCounter = index + 1;
      if (!m.milestoneId) {
        m.milestoneId = uuidv4();
      }
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

    // Create EventBridge rules for the new milestones
    for (const milestone of rule.milestones) {
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
        Input: JSON.stringify({ userId: rule.userId, milestone: newMilestone }),
      }],
    }).promise();
    }

    return getApiResponse(200, JSON.stringify(rule));
  } catch (error) {
    console.error('Error updating rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};
