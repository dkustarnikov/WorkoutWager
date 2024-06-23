import { APIGatewayTokenAuthorizerEvent, PolicyDocument, Statement, Context, APIGatewayAuthorizerResult } from 'aws-lambda';
import jwt, { JwtPayload } from 'jsonwebtoken';

// Replace 'your_jwt_secret' with the secret used to sign your JWT
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

export const handler = async (event: APIGatewayTokenAuthorizerEvent, context: Context): Promise<APIGatewayAuthorizerResult> => {
  const token = event.authorizationToken;
  console.log('event.authorizationToken', token);
  console.log('secret', JWT_SECRET);
  console.log('context', context);

  try {
    // Verify the token using the secret
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    console.log('User should be allowed:', decoded);
  } catch (err) {
    console.log('User should be denied:', err);
  }

  // Always allow the request
  return generatePolicy('user', 'Allow', event.methodArn);
};

const generatePolicy = (principalId: string, effect: string, resource: string): APIGatewayAuthorizerResult => {
  const authResponse: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: generatePolicyDocument(effect, resource),
  };

  return authResponse;
};

const generatePolicyDocument = (effect: string, resource: string): PolicyDocument => {
  const policyDocument: PolicyDocument = {
    Version: '2012-10-17',
    Statement: [generateStatement(effect, resource)],
  };

  return policyDocument;
};

const generateStatement = (effect: string, resource: string): Statement => {
  const statement: Statement = {
    Action: 'execute-api:Invoke',
    Effect: effect,
    Resource: resource,
  };

  return statement;
};
