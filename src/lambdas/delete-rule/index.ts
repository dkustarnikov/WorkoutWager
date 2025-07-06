import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { Rule } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return getApiResponse(400, JSON.stringify({ message: 'Rule ID is required' }));
    }

    const getParams = {
      TableName: TABLE_NAME,
      Key: { ruleId },
    };

    const existingRule = await dynamoDb.get(getParams).promise();
    if (!existingRule.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const rule = existingRule.Item as Rule;

    if (Array.isArray(rule.milestones)) {
      for (const milestone of rule.milestones) {
        const milestoneRuleName = `MilestoneRule_${milestone.milestoneId}`;

        await eventBridge.removeTargets({
          Rule: milestoneRuleName,
          Ids: [milestoneRuleName],
        }).promise();

        await eventBridge.deleteRule({
          Name: milestoneRuleName,
        }).promise();
      }
    }

    await dynamoDb.delete({ TableName: TABLE_NAME, Key: { ruleId } }).promise();

    return getApiResponse(200, JSON.stringify({ message: `Rule with ID ${ruleId} deleted successfully` }));
  } catch (error) {
    console.error('Error deleting rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};
