import * as awsLambda from 'aws-lambda';
import { getApiResponse } from '../../common/helpers';
import * as AWS from 'aws-sdk';
import { User } from '../../common/models';

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME_RULES = process.env.RULES_TABLE || 'Rules';
const TABLE_NAME_USER_INFO = process.env.USER_INFO_TABLE || 'UserInfo';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;
    const { userId, email } = JSON.parse(event.body!);

    if (!userId && !email) {
      return getApiResponse(400, JSON.stringify({ message: 'userId or email must be provided' }));
    }

    let cognitoParams: AWS.CognitoIdentityServiceProvider.AdminGetUserRequest | undefined;
    if (userId) {
      cognitoParams = {
        UserPoolId: userPoolId,
        Username: userId,
      };
    } else if (email) {
      const listUsersParams = {
        UserPoolId: userPoolId,
        Filter: `email = \"${email}\"`,
        Limit: 1,
      };
      const users = await cognito.listUsers(listUsersParams).promise();
      if (!users.Users || users.Users.length === 0) {
        return getApiResponse(404, JSON.stringify({ message: 'User not found' }));
      }
      cognitoParams = {
        UserPoolId: userPoolId,
        Username: users.Users[0].Username!,
      };
    }

    if (!cognitoParams) {
      return getApiResponse(400, JSON.stringify({ message: 'Invalid request parameters' }));
    }

    // Check if the user record exists in UserInfo table
    const userInfoParams = {
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId: cognitoParams.Username },
    };
    const userInfoResult = await dynamoDb.get(userInfoParams).promise();
    
    if (userInfoResult.Item) {
      // User info exists, return it
      return getApiResponse(200, JSON.stringify(userInfoResult.Item));
    }

    // Fetch the user from Cognito if not found in UserInfo table
    const user = await cognito.adminGetUser(cognitoParams).promise();

    if (!user.UserAttributes) {
      return getApiResponse(404, JSON.stringify({ message: 'User attributes not found' }));
    }

    const emailAttribute = user.UserAttributes.find((attr) => attr.Name === 'email');
    const userEmail = emailAttribute ? emailAttribute.Value! : 'Email not found';

    // Query the Rules table to get ruleIds associated with the user
    const rulesParams = {
      TableName: TABLE_NAME_RULES,
      IndexName: 'userIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': user.Username,
      },
    };

    const rulesData = await dynamoDb.query(rulesParams).promise();
    const ruleIds = rulesData.Items ? rulesData.Items.map(item => item.ruleId) : [];

    const userInfo: User = {
      userId: user.Username,
      username: user.Username,
      email: userEmail,
      alpacaCreated: false,
      ruleIds: ruleIds,
    };

    // Save the new user info to UserInfo table
    const putParams = {
      TableName: TABLE_NAME_USER_INFO,
      Item: userInfo,
    };
    await dynamoDb.put(putParams).promise();

    return getApiResponse(200, JSON.stringify(userInfo));
  } catch (error) {
    console.error(error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
