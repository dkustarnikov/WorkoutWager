import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { User } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const TABLE_NAME_USER_INFO = process.env.USER_INFO_TABLE || 'UserInfo';
const TABLE_NAME_RULES = process.env.RULES_TABLE || 'Rules';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const { userId, email } = JSON.parse(event.body || '{}');

    if (!userId && !email) {
      return getApiResponse(400, JSON.stringify({ message: 'userId or email must be provided' }));
    }

    let actions: string[] = [];

    // Check if the user exists in the UserInfo table
    const userInfoParams = {
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId },
    };
    const userInfoResult = await dynamoDb.get(userInfoParams).promise();

    if (userInfoResult.Item) {
      actions.push('User already has records');
    } else {
      // Create a new user record
      const newUserInfo: User = {
        userId,
        username: email, // Assuming username is the email in this context
        email,
        alpacaCreated: false,
        ruleIds: [],
      };

      const putParams = {
        TableName: TABLE_NAME_USER_INFO,
        Item: newUserInfo,
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
      const existingRuleIds = userInfoResult.Item?.ruleIds || [];
      if (JSON.stringify(existingRuleIds) !== JSON.stringify(ruleIds)) {
        // Update the UserInfo with the latest ruleIds if they have changed
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

    return getApiResponse(200, JSON.stringify({ message: 'User configuration completed', actions }));
  } catch (error) {
    console.error('Error configuring user:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};