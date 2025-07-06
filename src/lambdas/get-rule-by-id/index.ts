import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { Rule } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const ruleId = event.pathParameters?.ruleId;

    if (!ruleId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing rule ID' }));
    }

    const result = await dynamoDb.get({
      TableName: TABLE_NAME,
      Key: { ruleId },
    }).promise();

    if (!result.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    return getApiResponse(200, JSON.stringify(result.Item as Rule));
  } catch (error) {
    console.error('Error retrieving rule:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
// This code is an AWS Lambda function that retrieves a specific rule by its ID from a DynamoDB table.
// It checks if the rule ID is provided in the path parameters, retrieves the rule from the specified table,
// and returns it in the response. If the rule is not found, it returns a 404 response; if an error occurs,
// it logs the error and returns a 500 response.