import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { Rule } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const { ruleName } = JSON.parse(event.body || '{}');

    if (!ruleName) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing rule name' }));
    }

    const result = await dynamoDb.query({
      TableName: TABLE_NAME,
      IndexName: 'ruleNameIndex',
      KeyConditionExpression: 'ruleName = :ruleName',
      ExpressionAttributeValues: {
        ':ruleName': ruleName,
      },
    }).promise();

    if (!result.Items || result.Items.length === 0) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    return getApiResponse(200, JSON.stringify(result.Items[0] as Rule));
  } catch (error) {
    console.error('Error retrieving rule:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
// This code is an AWS Lambda function that retrieves a rule by its name from a DynamoDB table.
// It expects the rule name to be provided in the request body, queries the DynamoDB table using a secondary index,
// and returns the rule if found. If the rule is not found, it returns a 404 response; if an error occurs,
// it logs the error and returns a 500 response.