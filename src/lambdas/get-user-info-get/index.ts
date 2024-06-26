import * as awsLambda from 'aws-lambda';
import { getApiResponse } from '../../common/helpers';
import * as AWS from 'aws-sdk';

const cognito = new AWS.CognitoIdentityServiceProvider();

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;
    const { userId, email } = JSON.parse(event.body!);

    if (!userId && !email) {
      return getApiResponse(400, JSON.stringify({ message: 'userId or email must be provided' }));
    }

    let params: AWS.CognitoIdentityServiceProvider.AdminGetUserRequest | undefined;
    if (userId) {
      params = {
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
      params = {
        UserPoolId: userPoolId,
        Username: users.Users[0].Username!,
      };
    }

    if (!params) {
      return getApiResponse(400, JSON.stringify({ message: 'Invalid request parameters' }));
    }

    const user = await cognito.adminGetUser(params).promise();

    if (!user.UserAttributes) {
      return getApiResponse(404, JSON.stringify({ message: 'User attributes not found' }));
    }

    const emailAttribute = user.UserAttributes.find((attr) => attr.Name === 'email');
    const userEmail = emailAttribute ? emailAttribute.Value : 'Email not found';

    const userInfo = {
      userId: user.Username,
      username: user.Username,
      email: userEmail,
    };

    return getApiResponse(200, JSON.stringify(userInfo));
  } catch (error) {
    console.error(error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};