import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult, Context } from 'aws-lambda';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';

const jwksUri = process.env.USER_POOL_CONGNITO_URI
  ? `${process.env.USER_POOL_CONGNITO_URI}/.well-known/jwks.json`
  : '';

if (!jwksUri) {
  throw new Error('Missing USER_POOL_CONGNITO_URI environment variable');
}

const client: JwksClient = jwksClient({ jwksUri });

function getKey(header: JwtHeader, callback: SigningKeyCallback): void {
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err || new Error('Signing key not found'));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
  context: Context,
): Promise<APIGatewayAuthorizerResult> => {
  const token = event.authorizationToken;
  console.log('Authorization token:', token);

  try {
    const tokenWithoutBearer = token.startsWith('Bearer ') ? token.slice(7) : token;

    return await new Promise((resolve) => {
      jwt.verify(tokenWithoutBearer, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
        if (err) {
          console.log('JWT verification failed:', err);
          resolve(generateDenyPolicy('user', event.methodArn));
        } else {
          console.log('JWT verified:', decoded);
          const userId = (decoded as any).sub as string;
          resolve(generateAllowPolicy(userId, event.methodArn));
        }
      });
    });
  } catch (err) {
    console.error('Error in authorizer:', err);
    return generateDenyPolicy('user', event.methodArn);
  }
};

function generateAllowPolicy(principalId: string, resource: string): APIGatewayAuthorizerResult {
  // Allow all methods/resources in this stage so the cached policy covers every endpoint
  const parts = resource.split('/');
  const wildcardResource = `${parts[0]}/${parts[1]}/*/*`;
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: wildcardResource,
        },
      ],
    },
    context: {
      userId: principalId,
    },
  };
}

function generateDenyPolicy(principalId: string, resource: string): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Deny',
          Resource: resource,
        },
      ],
    },
  };
}
// This code is an AWS Lambda function that acts as an authorizer for API Gateway.
// It verifies JWT tokens issued by AWS Cognito using the JWKs endpoint.
// If the token is valid, it generates an allow policy; otherwise, it generates a deny policy.
// The function uses the `jsonwebtoken` and `jwks-rsa` libraries to handle JWT verification and key retrieval.