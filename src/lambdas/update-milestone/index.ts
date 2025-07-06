import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import * as yup from 'yup';
import { getApiResponse, milestoneSchema, convertToCronExpression } from '../../common/helpers';
import { Rule, RuleStatus, Milestone } from '../../common/models';

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
    const updatedMilestoneData: Partial<Milestone> = requestBody.milestone;

    if (!updatedMilestoneData) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone data is required' }));
    }

    try {
      await milestoneSchema.validate(updatedMilestoneData, { abortEarly: false });
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

    if (rule.status === RuleStatus.completed) {
      return getApiResponse(400, JSON.stringify({ message: 'Cannot update milestone in a completed rule' }));
    }

    const index = rule.milestones.findIndex(m => m.milestoneId === milestoneId);
    if (index === -1) {
      return getApiResponse(404, JSON.stringify({ message: 'Milestone not found' }));
    }

    const original = rule.milestones[index];
    const updatedMilestone: Milestone = {
      ...original,
      ...updatedMilestoneData,
      milestoneId,
      milestoneCounter: original.milestoneCounter,
      completion: original.completion,
    };

    if (new Date(updatedMilestone.milestoneDeadline) > new Date(rule.deadline)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline cannot be past the rule deadline' }));
    }

    if (rule.milestones.some(m => m.milestoneDeadline === updatedMilestone.milestoneDeadline && m.milestoneId !== milestoneId)) {
      return getApiResponse(400, JSON.stringify({ message: 'Milestone deadline must be unique' }));
    }

    const deadlineChanged = updatedMilestone.milestoneDeadline !== original.milestoneDeadline;

    rule.milestones[index] = updatedMilestone;
    rule.milestones.sort((a, b) => new Date(a.milestoneDeadline).getTime() - new Date(b.milestoneDeadline).getTime());
    rule.milestones.forEach((m, i) => { m.milestoneCounter = i + 1; });

    rule.totalAmount = rule.milestones.reduce((sum, m) => sum + m.monetaryValue, 0);
    rule.updatedAt = new Date().toISOString();

    await dynamoDb.put({ TableName: TABLE_NAME, Item: rule }).promise();

    if (deadlineChanged) {
      const milestoneRuleName = `MilestoneRule_${milestoneId}`;
      const cronExpression = convertToCronExpression(updatedMilestone.milestoneDeadline);

      await eventBridge.removeTargets({ Rule: milestoneRuleName, Ids: [milestoneRuleName] }).promise();
      await eventBridge.deleteRule({ Name: milestoneRuleName }).promise();

      await eventBridge.putRule({
        Name: milestoneRuleName,
        ScheduleExpression: `cron(${cronExpression})`,
        State: 'ENABLED',
      }).promise();

      await eventBridge.putTargets({
        Rule: milestoneRuleName,
        Targets: [{
          Id: milestoneRuleName,
          Arn: LAMBDA_FUNCTION_ARN,
          Input: JSON.stringify({ userId: rule.userId, milestone: updatedMilestone }),
        }],
      }).promise();
    }

    return getApiResponse(200, JSON.stringify(rule));
  } catch (err) {
    console.error('Error updating milestone:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};

// This code is an AWS Lambda function that updates a milestone in an existing rule in a DynamoDB table.
// It validates the milestone using Yup, checks for uniqueness of deadlines, and updates the rule's total amount.
// If successful, it schedules the milestone using EventBridge and returns the updated rule; otherwise, it returns an error response.