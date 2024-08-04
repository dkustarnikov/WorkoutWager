import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { getApiResponse, ruleSchema } from '../../common/helpers'; // Adjust the path as necessary
import { Rule } from '../../common/models';
import * as yup from 'yup';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const requestBody = JSON.parse(event.body || '{}');

    try {
      await ruleSchema.validate(requestBody, { abortEarly: false });
    } catch (validationError) {
      if (validationError instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: validationError.errors }));
      }
      throw validationError; // rethrow if it's not a validation error
    }

    const { userId, ruleType, ruleName, generalObjective, totalAmount, deadline, milestones, status } = requestBody;

    // Validate milestones total monetary value
    let calculatedTotalAmount = 0;
    for (const milestone of milestones) {
      calculatedTotalAmount += milestone.monetaryValue;
    }

    if (calculatedTotalAmount !== totalAmount) {
      return getApiResponse(400, JSON.stringify({ message: 'Total monetary value of milestones does not match total amount of the rule' }));
    }

    const ruleId = uuidv4();
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const newRule: Rule = {
      ruleId,
      userId,
      ruleType,
      ruleName,
      generalObjective,
      totalAmount,
      deadline,
      milestones,
      createdAt,
      updatedAt,
      status
    };

    const params = {
      TableName: TABLE_NAME,
      Item: newRule,
    };

    await dynamoDb.put(params).promise();

    return getApiResponse(201, JSON.stringify(newRule));
  } catch (error) {
    console.error('Error creating rule:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};