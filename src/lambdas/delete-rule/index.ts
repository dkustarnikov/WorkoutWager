import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers'; // Adjust the path as necessary

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    // Get ruleId from the path parameters
    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return getApiResponse(400, JSON.stringify({ message: 'Rule ID is required' }));
    }

    // Delete the rule from DynamoDB
    const params = {
      TableName: TABLE_NAME,
      Key: {
        ruleId: ruleId,
      },
    };

    await dynamoDb.delete(params).promise();

    return getApiResponse(200, JSON.stringify({ message: `Rule with ID ${ruleId} deleted successfully` }));
  } catch (error) {
    console.error('Error deleting rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};
