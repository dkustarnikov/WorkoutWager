import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async () => {
  try {
    const result = await dynamoDb.scan({ TableName: TABLE_NAME }).promise();

    if (!result.Items || result.Items.length === 0) {
      return getApiResponse(404, JSON.stringify({ message: 'No rules found' }));
    }

    return getApiResponse(200, JSON.stringify(result.Items));
  } catch (error) {
    console.error('Error retrieving rules:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
// This code is an AWS Lambda function that retrieves all rules from a DynamoDB table.
// It scans the table specified by the environment variable `RULES_TABLE` (defaulting to 'Rules') and returns the items found.
// If no rules are found, it returns a 404 response; if an error occurs, it logs the error and returns a 500 response.