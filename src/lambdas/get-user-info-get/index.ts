import * as awsLambda from 'aws-lambda';
import { getApiResponse } from '../../common/helpers';
import * as AWS from 'aws-sdk';
import { User } from '../../common/models';
import { createClient } from '@alpacahq/typescript-sdk';

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME_RULES = process.env.RULES_TABLE || 'Rules';
const TABLE_NAME_USER_INFO = process.env.USER_INFO_TABLE || 'UserInfo';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  console.log('Event received:', event);

  try {
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;
    const { userId, email, alpacaApiKey, alpacaApiSecret, paperTrading } = JSON.parse(event.body || '{}');

    if (!userId && !email) {
      console.log('Validation failed: userId or email must be provided');
      return getApiResponse(400, JSON.stringify({ message: 'userId or email must be provided' }));
    }

    let cognitoParams: AWS.CognitoIdentityServiceProvider.AdminGetUserRequest | undefined;
    let alpacaAccountInfo = null;
    let alpacaCreated = false;

    if (userId) {
      console.log('Searching for user by userId:', userId);
      cognitoParams = {
        UserPoolId: userPoolId,
        Username: userId,
      };
    } else if (email) {
      console.log('Searching for user by email:', email);
      const listUsersParams = {
        UserPoolId: userPoolId,
        Filter: `email = \"${email}\"`,
        Limit: 1,
      };
      const users = await cognito.listUsers(listUsersParams).promise();
      if (!users.Users || users.Users.length === 0) {
        console.log('User not found with email:', email);
        return getApiResponse(404, JSON.stringify({ message: 'User not found' }));
      }
      cognitoParams = {
        UserPoolId: userPoolId,
        Username: users.Users[0].Username!,
      };
    }

    if (!cognitoParams) {
      console.log('Invalid request parameters');
      return getApiResponse(400, JSON.stringify({ message: 'Invalid request parameters' }));
    }

    console.log('Checking if user record exists in UserInfo table');
    const userInfoParams = {
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId: cognitoParams.Username },
    };
    const userInfoResult = await dynamoDb.get(userInfoParams).promise();
    console.log('UserInfo table result:', userInfoResult);

    if (alpacaApiKey && alpacaApiSecret) {
      try {
        console.log('Fetching Alpaca account information');
        const alpacaClient = createClient({
          key: alpacaApiKey,
          secret: alpacaApiSecret,
        });

        alpacaAccountInfo = await alpacaClient.getAccount();
        console.log('Alpaca account information retrieved successfully');
        alpacaCreated = true;

      } catch (error) {
        console.error('Failed to retrieve Alpaca account info:', error);
      }
    }

    let userInfo: User;

    if (userInfoResult.Item) {
      console.log('User info exists in UserInfo table, updating with Alpaca info');
      userInfo = {
        userId: userInfoResult.Item.userId,
        username: userInfoResult.Item.username,
        email: userInfoResult.Item.email,
        ruleIds: userInfoResult.Item.ruleIds,
        alpacaCreated, // Update based on Alpaca retrieval
        paperTrading
      };    
    } else {
      console.log('User not found in UserInfo table, fetching from Cognito');
      const user = await cognito.adminGetUser(cognitoParams).promise();
      console.log('Cognito user data:', user);

      if (!user.UserAttributes) {
        console.log('User attributes not found in Cognito');
        return getApiResponse(404, JSON.stringify({ message: 'User attributes not found' }));
      }

      const emailAttribute = user.UserAttributes.find((attr) => attr.Name === 'email');
      const userEmail = emailAttribute ? emailAttribute.Value! : 'Email not found';

      console.log('Querying Rules table for associated ruleIds');
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
      console.log('Rules table data:', rulesData);

      userInfo = {
        userId: user.Username,
        username: user.Username,
        email: userEmail,
        alpacaCreated,
        ruleIds: ruleIds,
        paperTrading,
      };
    }

    console.log('Saving updated user info to UserInfo table');
    const putParams = {
      TableName: TABLE_NAME_USER_INFO,
      Item: userInfo,
    };
    await dynamoDb.put(putParams).promise();

    console.log('Returning response with user info and Alpaca account info');
    return getApiResponse(200, JSON.stringify({
      ...userInfo,
      alpacaAccountInfo,
    }));
  } catch (error) {
    console.error('Error occurred during Lambda execution:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};