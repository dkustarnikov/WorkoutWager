import { createClient } from '@alpacahq/typescript-sdk';
import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import * as yup from 'yup';
import { getApiResponse } from '../../common/helpers';
import { User } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME_USER_INFO = process.env.USER_INFO_TABLE || 'UserInfo';
const TABLE_NAME_RULES = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const { userId, email, alpacaApiKey, alpacaApiSecret, paperTrading } = JSON.parse(event.body || '{}');

    // Validation schema
    const schema = yup.object().shape({
      userId: yup.string().required('User ID is required'),
      email: yup.string().email('Invalid email format').required('Email is required'),
      alpacaApiKey: yup.string(),
      alpacaApiSecret: yup.string(),
      paperTrading: yup.boolean(),
    });

    // Validate request body
    try {
      await schema.validate({ userId, email, alpacaApiKey, alpacaApiSecret, paperTrading });
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: error.errors }));
      }
      // Re-throw the error if it's not a ValidationError
      throw error;
    }

    let actions: string[] = [];

    // Check if the user exists in the UserInfo table
    const userInfoParams = {
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId },
    };
    const userInfoResult = await dynamoDb.get(userInfoParams).promise();
    let userInfo: User;

    if (userInfoResult.Item) {
      actions.push('User already has records');
      userInfo = userInfoResult.Item as User;
    } else {
      // Create a new user record
      userInfo = {
        userId,
        username: email, // Assuming username is the email in this context
        email,
        alpacaCreated: false,
        ruleIds: [],
        paperTrading: false,
      };

      const putParams = {
        TableName: TABLE_NAME_USER_INFO,
        Item: userInfo,
      };
      await dynamoDb.put(putParams).promise();
      actions.push('User is added to the records');
    }

    // Check and update the ruleIds in UserInfo
    const rulesParams = {
      TableName: TABLE_NAME_RULES,
      IndexName: 'userIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    };

    const rulesData = await dynamoDb.query(rulesParams).promise();
    const ruleIds = rulesData.Items ? rulesData.Items.map(item => item.ruleId) : [];

    if (ruleIds.length > 0) {
      if (JSON.stringify(userInfo.ruleIds) !== JSON.stringify(ruleIds)) {
        // Update the UserInfo with the latest ruleIds if they have changed
        userInfo.ruleIds = ruleIds;
        const updateParams = {
          TableName: TABLE_NAME_USER_INFO,
          Key: { userId },
          UpdateExpression: 'set ruleIds = :ruleIds',
          ExpressionAttributeValues: {
            ':ruleIds': ruleIds,
          },
        };
        await dynamoDb.update(updateParams).promise();
        actions.push('Rules got updated. Now they are the latest');
      } else {
        actions.push('Rules are up to date');
      }
    } else {
      actions.push('No rules found for the user');
    }

    // Check if Alpaca credentials are provided and update user info accordingly
    if (alpacaApiKey && alpacaApiSecret) {
      try {
        const alpacaClient = createClient({
          key: alpacaApiKey,
          secret: alpacaApiSecret,
        });

        const alpacaAccountInfo = await alpacaClient.getAccount();
        if (alpacaAccountInfo) {
          userInfo.alpacaCreated = true;
        }

        if (paperTrading) {
          userInfo.paperTrading = true;
        }

        const updateParams = {
          TableName: TABLE_NAME_USER_INFO,
          Key: { userId },
          UpdateExpression: 'set alpacaCreated = :alpacaCreated, paperTrading = :paperTrading',
          ExpressionAttributeValues: {
            ':alpacaCreated': true,
            ':paperTrading': paperTrading || userInfo.paperTrading,
          },
        };
        await dynamoDb.update(updateParams).promise();
        actions.push('Alpaca account linked successfully');
      } catch (error) {
        console.error('Failed to retrieve Alpaca account info:', error);
        actions.push('Failed to link Alpaca account');
      }
    }

    return getApiResponse(200, JSON.stringify({ message: 'User configuration completed', actions }));
  } catch (error) {
    console.error('Error configuring user:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
