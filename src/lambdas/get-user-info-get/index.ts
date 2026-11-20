import * as awsLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { getCallerId, unauthorizedResponse } from '../../common/auth';
import { getApiResponse } from '../../common/helpers';
import { DEFAULT_PLAY_MONEY, STARTING_BALANCE, User } from '../../common/models';

const dynamoDb = new AWS.DynamoDB.DocumentClient();

const TABLE_NAME_USER_INFO = process.env.USER_INFO_TABLE || 'UserInfo';

/**
 * Returns the authenticated caller's own profile.
 *
 * Previously this accepted any `userId` or `email` in the body and returned that user's
 * record (and looked emails up with an unescaped Cognito filter). Now it only ever
 * returns the caller's record. Body fields are accepted but ignored, so older clients
 * that still send them keep working.
 */
export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  try {
    const callerId = getCallerId(event);
    if (!callerId) {
      return unauthorizedResponse();
    }

    const userInfoResult = await dynamoDb.get({
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId: callerId },
    }).promise();

    if (!userInfoResult.Item) {
      return getApiResponse(404, JSON.stringify({ message: 'User profile not found — call /configure-user first' }));
    }

    // Profiles created before the play-money economy have no balance fields yet.
    const userInfo = userInfoResult.Item as User;
    return getApiResponse(200, JSON.stringify({
      ...userInfo,
      balance: userInfo.balance ?? STARTING_BALANCE,
      pendingBalance: userInfo.pendingBalance ?? 0,
      stars: userInfo.stars ?? 0,
      playMoney: userInfo.playMoney ?? DEFAULT_PLAY_MONEY,
    }));
  } catch (err) {
    console.error('Error fetching user info:', err);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
