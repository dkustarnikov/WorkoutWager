import * as awsLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { User } from '../../common/models';

const cognito = new AWS.CognitoIdentityServiceProvider();
const dynamoDb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME_RULES = process.env.RULES_TABLE || 'Rules';
const TABLE_NAME_USER_INFO = process.env.USER_INFO_TABLE || 'UserInfo';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;
    const { userId, email } = JSON.parse(event.body || '{}');

    if (!userId && !email) {
      return getApiResponse(400, JSON.stringify({ message: 'userId or email must be provided' }));
    }

    let cognitoUserId: string;

    if (userId) {
      cognitoUserId = userId;
    } else {
      const users = await cognito.listUsers({
        UserPoolId: userPoolId,
        Filter: `email = \"${email}\"`,
        Limit: 1,
      }).promise();

      if (!users.Users || users.Users.length === 0) {
        return getApiResponse(404, JSON.stringify({ message: 'User not found with provided email' }));
      }

      cognitoUserId = users.Users[0].Username!;
    }

    // Fetch user record from Dynamo
    const userInfoResult = await dynamoDb.get({
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId: cognitoUserId },
    }).promise();

    if (!userInfoResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'User not found in UserInfo table' }));
    }

    const userInfo = userInfoResult.Item as User;

    return getApiResponse(200, JSON.stringify(userInfo));
  } catch (err) {
    console.error('Error fetching user info:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
// This code is an AWS Lambda function that retrieves user information from a DynamoDB table.
// It checks if a user ID or email is provided in the request body, queries the Cognito User Pool for the user ID if only an email is provided,
// and then retrieves the user's information from the DynamoDB UserInfo table.
// If successful, it returns the user information; if not found, it returns a 404 response; and if an error occurs, it logs the error and returns a 500 response.