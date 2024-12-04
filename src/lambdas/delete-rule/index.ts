import * as awsLambda from 'aws-lambda';
import { DynamoDB, EventBridge } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers'; // Adjust the path as necessary

const dynamoDb = new DynamoDB.DocumentClient();
const eventBridge = new EventBridge();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    // Get ruleId from the path parameters
    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return getApiResponse(400, JSON.stringify({ message: 'Rule ID is required' }));
    }

    // Fetch the existing rule from DynamoDB
    const getParams = {
      TableName: TABLE_NAME,
      Key: { ruleId },
    };

    const existingRule = await dynamoDb.get(getParams).promise();
    if (!existingRule.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const rule = existingRule.Item;

    // Delete the EventBridge rules associated with the rule's milestones
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

    // Delete the rule from DynamoDB
    const deleteParams = {
      TableName: TABLE_NAME,
      Key: {
        ruleId: ruleId,
      },
    };

    await dynamoDb.delete(deleteParams).promise();

    return getApiResponse(200, JSON.stringify({ message: `Rule with ID ${ruleId} deleted successfully` }));
  } catch (error) {
    console.error('Error deleting rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};
