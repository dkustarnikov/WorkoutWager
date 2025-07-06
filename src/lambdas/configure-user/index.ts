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
    const { userId, email } = JSON.parse(event.body || '{}');

    const schema = yup.object().shape({
      userId: yup.string().required('User ID is required'),
      email: yup.string().email('Invalid email format').required('Email is required'),
    });

    try {
      await schema.validate({ userId, email });
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        return getApiResponse(400, JSON.stringify({ message: 'Validation failed', errors: error.errors }));
      }
      throw error;
    }

    const actions: string[] = [];

    // Check for existing user
    const userInfoResult = await dynamoDb.get({
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId },
    }).promise();

    let userInfo: User;

    if (userInfoResult.Item) {
      actions.push('User already exists');
      userInfo = userInfoResult.Item as User;
    } else {
      userInfo = {
        userId,
        username: email,
        email,
        alpacaCreated: false,
        paperTrading: false,
        ruleIds: [],
      };

      await dynamoDb.put({ TableName: TABLE_NAME_USER_INFO, Item: userInfo }).promise();
      actions.push('New user created');
    }

    // Update ruleIds if needed
    const rulesData = await dynamoDb.query({
      TableName: TABLE_NAME_RULES,
      IndexName: 'userIdIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    }).promise();

    const ruleIds = rulesData.Items?.map(item => item.ruleId) ?? [];

    if (JSON.stringify(userInfo.ruleIds) !== JSON.stringify(ruleIds)) {
      await dynamoDb.update({
        TableName: TABLE_NAME_USER_INFO,
        Key: { userId },
        UpdateExpression: 'set ruleIds = :ruleIds',
        ExpressionAttributeValues: {
          ':ruleIds': ruleIds,
        },
      }).promise();
      actions.push('Updated ruleIds');
    } else {
      actions.push('RuleIds already up to date');
    }

    return getApiResponse(200, JSON.stringify({ message: 'User configured successfully', actions }));
  } catch (error) {
    console.error('Error configuring user:', error);
    return getApiResponse(500, JSON.stringify({ message: `Internal Server Error. Error: ${error}` }));
  }
};
// This code is an AWS Lambda function that configures a user by checking if they exist in the DynamoDB UserInfo table,
// creating a new user if they do not, and updating their ruleIds based on the rules associated with them in the Rules table.
// It uses the AWS SDK for DynamoDB and Yup for validation. The function returns an API response indicating success or failure.