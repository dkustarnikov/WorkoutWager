import * as awsLambda from 'aws-lambda';
import { DynamoDB } from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';
import { User } from '../../common/models';

const dynamoDb = new DynamoDB.DocumentClient();
const USER_INFO_TABLE = process.env.USER_INFO_TABLE || 'UserInfo';

export interface LeaderboardEntry {
  userId: string;
  username: string;
  stars: number;
  balance: number;
  pendingBalance: number;
}

/**
 * `username` defaults to the sign-up email, and the leaderboard is visible to every
 * signed-in user — so never expose a full email address here.
 */
export function publicName(username: string | undefined): string {
  if (!username) return 'anonymous';
  const at = username.indexOf('@');
  if (at === -1) return username;
  const local = username.slice(0, at);
  return `${local.slice(0, Math.min(4, Math.max(1, local.length - 1)))}•••`;
}

/** GET /leaderboard — all users ranked by stars (highest first). */
export const handler: awsLambda.Handler = async () => {
  try {
    const users: User[] = [];
    let lastKey: DynamoDB.DocumentClient.Key | undefined;
    do {
      const page = await dynamoDb.scan({ TableName: USER_INFO_TABLE, ExclusiveStartKey: lastKey }).promise();
      users.push(...((page.Items ?? []) as User[]));
      lastKey = page.LastEvaluatedKey;
    } while (lastKey);

    const leaderboard: LeaderboardEntry[] = users
      .map(u => ({
        userId: u.userId,
        username: publicName(u.username),
        stars: u.stars ?? 0,
        balance: u.balance ?? 0,
        pendingBalance: u.pendingBalance ?? 0,
      }))
      .sort((a, b) => b.stars - a.stars);

    return getApiResponse(200, JSON.stringify(leaderboard));
  } catch (error) {
    console.error('Error retrieving leaderboard:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};
