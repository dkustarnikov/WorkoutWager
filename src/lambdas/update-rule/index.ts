import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse, ruleSchema } from '../../common/helpers'; // Adjust the path as necessary
import * as yup from 'yup';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing ruleId in path parameters' }));
    }

    const requestBody = JSON.parse(event.body || '{}');

    try {
      await ruleSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    const params = {
      TableName: TABLE_NAME,
      Key: { ruleId },
    };

    const existingRule = await dynamoDb.get(params).promise();

    if (!existingRule.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'Rule not found' }));
    }

    const updatedRule = {
      ...existingRule.Item,
      ...requestBody,
      updatedAt: new Date().toISOString(),
    };

    try {
      await ruleSchema.validate(updatedRule, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: validationError.errors }));
      }
      throw validationError;
    }

    const updateParams = {
      TableName: TABLE_NAME,
      Item: updatedRule,
    };

    await dynamoDb.put(updateParams).promise();

    return getApiResponse(200, JSON.stringify(updatedRule));
  } catch (error) {
    console.error('Error updating rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};