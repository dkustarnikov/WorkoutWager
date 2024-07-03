import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers'; // Adjust the path as necessary

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'RulesTable';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const ruleId = event.pathParameters?.ruleId;

    if (!ruleId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing rule ID' }));
    }

    const params = {
      TableName: TABLE_NAME,
      Key: {
        ruleId: ruleId,
      },
    };

    const result = await dynamoDb.get(params).promise();

    if (!result.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    return getApiResponse(200, JSON.stringify(result.Item));
  } catch (error) {
    console.error('Error retrieving rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};