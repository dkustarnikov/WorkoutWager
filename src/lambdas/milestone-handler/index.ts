import { createClient } from '@alpacahq/typescript-sdk';
import * as awsLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { getApiResponse } from '../../common/helpers';

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const secretsManager = new AWS.SecretsManager();
const lambda = new AWS.Lambda();
const TABLE_NAME_USER_INFO = process.env.USER_INFO_TABLE || 'UserInfo';

export const handler: awsLambda.Handler = async (event: awsLambda.APIGatewayProxyEvent) => {
  console.log('MILESTONE HANDLER IS INVOKED!', event);

  try {
    const { milestone, userId } = JSON.parse(event.body || '{}');

    console.log('Parsed event body:', milestone);

    // Validate milestone input
    if (!milestone || !userId) {
      console.error('Milestone validation failed: Milestone or userId is missing');
      return getApiResponse(400, JSON.stringify({ message: 'Milestone and userId are required' }));
    }

    // Check if milestone is already completed
    if (milestone.completion) {
      console.log('Milestone is already completed');
      return getApiResponse(200, JSON.stringify({ message: 'Milestone is completed' }));
    }

    // Fetch user info from DynamoDB
    const userInfoParams = {
      TableName: TABLE_NAME_USER_INFO,
      Key: { userId },
    };
    const userInfoResult = await dynamoDb.get(userInfoParams).promise();

    console.log('User info fetched from DynamoDB:', userInfoResult);

    if (!userInfoResult.Item || !userInfoResult.Item.alpacaCreated) {
      console.error('User info not found or Alpaca account not created for userId:', userId);
      return getApiResponse(400, JSON.stringify({ message: 'User info not found or Alpaca account not created' }));
    }

    // Retrieve Alpaca credentials from Secrets Manager
    let alpacaCredentials;
    try {
      const secretName = `alpaca/creds/${userId}`;
      console.log('Fetching Alpaca credentials from Secrets Manager with secretName:', secretName);
      const secretValue = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
      alpacaCredentials = JSON.parse(secretValue.SecretString || '{}');
      console.log('Alpaca credentials retrieved:', alpacaCredentials);
    } catch (error) {
      console.error('Failed to retrieve Alpaca credentials:', error);
      return getApiResponse(400, JSON.stringify({ message: 'Alpaca credentials not found' }));
    }

    // Create Alpaca client
    console.log('Creating Alpaca client');
    const alpacaClient = createClient({
      key: alpacaCredentials.alpacaApiKey,
      secret: alpacaCredentials.alpacaApiSecret,
    });

    // Get the latest quote of SMX
    console.log('Fetching latest quote for SMX');
    // const latestQuote: any = await alpacaClient.getStocksQuotesLatest({ symbols: "AAPL,TSLA" });
    // console.log("latest Quote looks like: ", latestQuote);
    // const price = parseFloat(latestQuote[0].ask_price);
    const price = 5;
    console.log('Assuming SMX quote is 5');

    // Calculate quantity with a buffer
    const buffer = 0; // $0 buffer for price fluctuation
    const qty = Math.floor(milestone.monetaryValue / (price + buffer));
    console.log('Calculated quantity with buffer:', qty);

    // Get Alpaca account info to check cash availability
    console.log('Fetching Alpaca account info');
    const alpacaAccountInfo = await alpacaClient.getAccount();
    const { cash } = alpacaAccountInfo;
    console.log('Alpaca account cash balance:', cash);

    // Check if there is enough cash for the order
    if (parseFloat(cash) >= milestone.monetaryValue) {
      console.log('Enough cash available, creating order for SMX');
      await alpacaClient.createOrder({
        symbol: 'SMX',
        qty: qty,
        side: 'buy',
        type: 'market',
        time_in_force: 'opg',
      });
      console.log('Order created successfully');
      return getApiResponse(200, JSON.stringify({ message: 'Order created successfully' }));
    } else {
      console.log('Not enough cash, invoking deposit-alpaca-funds Lambda function');
      await lambda.invoke({
        FunctionName: 'deposit-alpaca-funds',
        InvocationType: 'Event',
        Payload: JSON.stringify({ userId }),
      }).promise();
      console.log('Deposit initiated successfully');
      return getApiResponse(200, JSON.stringify({ message: 'Not enough cash, deposit initiated' }));
    }
  } catch (error) {
    console.error('Error processing milestone:', error);
    return getApiResponse(500, JSON.stringify({ message: 'Internal Server Error' }));
  }
};