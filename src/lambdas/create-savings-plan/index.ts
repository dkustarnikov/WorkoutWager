import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { getApiResponse } from '../../common/helpers'; // Adjust the path as necessary
import { SavingsPlan } from '../../common/models'

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME = process.env.SAVINGS_PLANS_TABLE || 'dev-SavingsPlans';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const { userId, planName, amount } = JSON.parse(event.body || '{}');

    if (!userId || !planName || !amount) {
      return getApiResponse(400, JSON.stringify({ message: 'Missing required fields' }));
    }

    const planId = uuidv4();
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;

    const newPlan: SavingsPlan = {
      planId,
      userId,
      planName,
      amount,
      createdAt,
      updatedAt
    };

    const params = {
      TableName: TABLE_NAME,
      Item: newPlan
    };

    await dynamoDb.put(params).promise();

    return getApiResponse(201, JSON.stringify(newPlan));
  } catch (error) {
    console.error('Error creating savings plan:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error: ${error}` }));
  }
};
