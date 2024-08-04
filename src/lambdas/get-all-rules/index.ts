import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers'; // Adjust the path as necessary

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'RulesTable';

export const handler: awsLambda.Handler = async () => {
  try {
    const params = {
      TableName: TABLE_NAME,
    };

    const result = await dynamoDb.scan(params).promise();

    if (!result.Items || result.Items.length === 0) {
      return getApiResponse(404, JSON.stringify({ message: 'No rules found' }));
    }

    return getApiResponse(200, JSON.stringify(result.Items));
  } catch (error) {
    console.error('Error retrieving rules:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};