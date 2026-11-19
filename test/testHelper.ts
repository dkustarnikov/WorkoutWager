import { APIGatewayProxyEvent } from 'aws-lambda';
import { USER_ID } from './fixtures';

/** A mock API Gateway event. By default the caller is USER_ID — the owner of the fixture goals. */

export const getMockEvent = (): APIGatewayProxyEvent => ({
  body: null,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/test',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: {},
  requestContext: {
    accountId: '',
    apiId: '',
    authorizer: { userId: USER_ID },
    protocol: '',
    httpMethod: 'GET',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '',
      user: null,
      userAgent: '',
      userArn: null,
    },
    path: '/test',
    stage: '',
    requestId: '',
    requestTimeEpoch: 0,
    resourceId: '',
    resourcePath: '',
  },
  resource: '',
});
