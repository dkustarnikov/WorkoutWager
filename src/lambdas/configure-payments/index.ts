import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import * as yup from 'yup';
import { getCallerId, unauthorizedResponse } from '../../common/auth';
import { getApiResponse } from '../../common/helpers';
import { PaymentConfig } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const USER_INFO_TABLE = process.env.USER_INFO_TABLE || 'UserInfo';

const schema = yup.object().shape({
  playMoney: yup.boolean().required('playMoney is required'),
  provider: yup.string().default('stub'),
  details: yup.object().notRequired(),
});

/**
 * POST /configure-payments — switch the caller between play money and (future) real money.
 * Real payments are not integrated yet: the provider is recorded as a stub.
 */
export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const userId = getCallerId(event);
    if (!userId) {
      return unauthorizedResponse();
    }

    let validated: yup.InferType<typeof schema>;
    try {
      validated = await schema.validate(JSON.parse(event.body || '{}'), { abortEarly: false });
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: error.errors }));
      }
      throw error;
    }
    const { playMoney, provider, details } = validated;

    const userResult = await dynamoDb.get({ TableName: USER_INFO_TABLE, Key: { userId } }).promise();
    if (!userResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'User not found. Call POST /configure-user first.' }));
    }

    const paymentConfig: PaymentConfig = {
      provider: provider || 'stub',
      configuredAt: new Date().toISOString(),
      ...(details ? { details: details as Record<string, unknown> } : {}),
    };

    await dynamoDb.update({
      TableName: USER_INFO_TABLE,
      Key: { userId },
      UpdateExpression: 'SET playMoney = :playMoney, paymentConfig = :paymentConfig',
      ExpressionAttributeValues: { ':playMoney': playMoney, ':paymentConfig': paymentConfig },
    }).promise();

    return getApiResponse(200, JSON.stringify({
      message: playMoney
        ? 'Play money mode enabled — stakes use free balance'
        : 'Payments configured (stub) — playMoney disabled for real-money mode later',
      userId,
      playMoney,
      paymentConfig,
      balance: userResult.Item.balance ?? 0,
      pendingBalance: userResult.Item.pendingBalance ?? 0,
      stars: userResult.Item.stars ?? 0,
    }));
  } catch (error) {
    console.error('Error configuring payments:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
