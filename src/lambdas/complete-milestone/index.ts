import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { Rule, RuleStatus, Milestone } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const ruleId = event.pathParameters?.ruleId;
    const milestoneId = event.pathParameters?.milestoneId;

    if (!ruleId || !milestoneId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing ruleId or milestoneId' }));
    }

    const ruleResult = await dynamoDb.get({ TableName: TABLE_NAME, Key: { ruleId } }).promise();
    if (!ruleResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const rule = ruleResult.Item as Rule;

    if (rule.status === RuleStatus.completed) {
      return getApiResponse(400, JSON.stringify({ message: 'Rule already completed' }));
    }

    const index = rule.milestones.findIndex(m => m.milestoneId === milestoneId);
    if (index === -1) {
      return getApiResponse(404, JSON.stringify({ message: 'Milestone not found' }));
    }

    const milestone = rule.milestones[index];

    if (milestone.completion) {
      return getApiResponse(200, JSON.stringify({ message: 'Milestone already completed' }));
    }

    // 1. Mark milestone as completed
    milestone.completion = true;
    rule.milestones[index] = milestone;

    // 2. Check if all milestones are now completed
    const allCompleted = rule.milestones.every(m => m.completion);
    if (allCompleted) {
      rule.status = RuleStatus.completed;
    }

    rule.updatedAt = new Date().toISOString();

    // 3. Save updated rule
    await dynamoDb.put({ TableName: TABLE_NAME, Item: rule }).promise();

    // 4. Cancel EventBridge rule if exists
    const milestoneRuleName = `MilestoneRule_${milestoneId}`;
    try {
      await eventBridge.removeTargets({ Rule: milestoneRuleName, Ids: [milestoneRuleName] }).promise();
      await eventBridge.deleteRule({ Name: milestoneRuleName }).promise();
    } catch (e: any) {
      console.warn(`EventBridge cleanup skipped or failed for ${milestoneRuleName}:`, JSON.stringify(e));
    }

    return getApiResponse(200, JSON.stringify({ message: 'Milestone marked as completed', rule }));
  } catch (err) {
    console.error('Error in complete-milestone:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
// This code is an AWS Lambda function that marks a milestone as completed in a rule.
// It retrieves the rule and milestone from DynamoDB, checks if the milestone exists and is not already completed,
// updates the milestone's completion status, checks if all milestones are completed, and updates the rule status accordingly.
// It also cleans up any associated EventBridge rules and returns an appropriate API response.