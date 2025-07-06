import * as awsLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const ses = new AWS.SES();
const TABLE_NAME_USER_INFO = process.env.USER_INFO_TABLE || 'UserInfo';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  console.log('MILESTONE HANDLER INVOKED', event);

  try {
    const { milestone, userId } = JSON.parse(event.body || '{}');

    if (!milestone || !userId) {
      return getApiResponse(400, 'Milestone and userId are required');
    }

    if (milestone.completion) {
      return getApiResponse(200, 'Milestone already completed');
    }

    const user = await dynamoDb.get({
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId },
    }).promise();

    if (!user.Item?.email) {
      return getApiResponse(404, 'User email not found');
    }

    const emailParams = {
      Source: 'dmitry.kustarnikov@gmail.com', // Must be verified in SES
      Destination: { ToAddresses: [user.Item.email] },
      Message: {
        Subject: { Data: 'Workout Missed - Wager Triggered' },
        Body: {
          Text: {
            Data: `You missed your workout: ${milestone.name || 'Unnamed Milestone'}.\n$${milestone.monetaryValue} has been donated to charity (simulated).`,
          },
        },
      },
    };

    await ses.sendEmail(emailParams).promise();
    return getApiResponse(200, 'User notified via email');
  } catch (err) {
    console.error('Milestone processing failed', err);
    return getApiResponse(500, 'Internal Server Error');
  }
};

// This code is an AWS Lambda function that handles milestones by notifying users via email when a milestone is missed.
// It retrieves the user's email from a DynamoDB table and sends an email using AWS SES.
// If the milestone is already completed, it returns a 200 response without sending an email.
// If the user is not found or their email is not available, it returns a 404 response.
// In case of any errors, it logs the error and returns a 500 response.