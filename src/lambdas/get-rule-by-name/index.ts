import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers'; // Adjust the path as necessary

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'RulesTable';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const { ruleName } = JSON.parse(event.body || '{}');

    if (!ruleName) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing rule name' }));
    }

    const params = {
      TableName: TABLE_NAME,
      IndexName: 'ruleNameIndex', // Ensure this matches the index defined in your table
      KeyConditionExpression: 'ruleName = :ruleName',
      ExpressionAttributeValues: {
        ':ruleName': ruleName,
      },
    };

    const result = await dynamoDb.query(params).promise();

    if (!result.Items || result.Items.length === 0) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    return getApiResponse(200, JSON.stringify(result.Items[0]));
  } catch (error) {
    console.error('Error retrieving rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};