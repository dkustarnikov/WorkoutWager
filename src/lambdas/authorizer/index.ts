import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult, Context } from 'aws-lambda';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';

const jwksUri = `${process.env.USER_POOL_CONGNITO_URI}/.well-known/jwks.json` || '';

const client: JwksClient = jwksClient({
  jwksUri: jwksUri
});

function getKey(header: JwtHeader, callback: SigningKeyCallback): void {
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err || new Error('Signing key not found'));
      return;
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

export const handler = async (event: APIGatewayTokenAuthorizerEvent, context: Context): Promise<APIGatewayAuthorizerResult> => {
  const token = event.authorizationToken;

  console.log('event.authorizationToken', token);
  console.log('context', context);

  try {
    // Remove Bearer prefix if it exists
    const tokenWithoutBearer = token.startsWith('Bearer ') ? token.slice(7) : token;

    // Verify the token using the JWKS
    return new Promise((resolve) => {
      jwt.verify(tokenWithoutBearer, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
        if (err) {
          console.log('JWT verification failed:', err);
          resolve(generateDenyPolicy('user', event.methodArn));
          return;
        }
        console.log('JWT verification succeeded:', decoded);
        resolve(generateAllowPolicy((decoded as any).sub, event.methodArn));
      });
    });
  } catch (err) {
    console.log('Error in authorization function:', err);
    return generateDenyPolicy('user', event.methodArn);
  }
};

function generateAllowPolicy(principalId: string, resource: string): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: resource
        }
      ]
    }
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
          Resource: resource
        }
      ]
    }
  };
}