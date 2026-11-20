import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import jwt, { JwtHeader, JwtPayload, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

/**
 * API Gateway TOKEN authorizer for Cognito JWTs.
 *
 * Accepts an ID or access token only if it is signed by the user pool (RS256 via JWKS),
 * was issued by COGNITO_ISSUER, and was issued to one of COGNITO_ALLOWED_CLIENT_IDS.
 * On success the caller's Cognito `sub` (and email, if present) is passed to handlers in
 * requestContext.authorizer. Tokens and claims are never logged.
 */

const issuer = process.env.COGNITO_ISSUER;
if (!issuer) {
  throw new Error('Missing COGNITO_ISSUER environment variable');
}

const allowedClientIds = (process.env.COGNITO_ALLOWED_CLIENT_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const client = jwksClient({
  jwksUri: `${issuer}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
});

function getKey(header: JwtHeader, callback: SigningKeyCallback): void {
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err || new Error('Signing key not found'));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

interface CognitoClaims extends JwtPayload {
  token_use?: string;
  client_id?: string;
  email?: string;
}

function verifyToken(token: string): Promise<CognitoClaims> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, { algorithms: ['RS256'], issuer }, (err, decoded) => {
      if (err || !decoded || typeof decoded === 'string') {
        reject(err || new Error('Token could not be decoded'));
        return;
      }
      resolve(decoded as CognitoClaims);
    });
  });
}

/** ID tokens carry the app client in `aud`; access tokens in `client_id`. */
function getClientId(claims: CognitoClaims): string | undefined {
  const candidate = claims.token_use === 'id' ? claims.aud : claims.client_id;
  if (Array.isArray(candidate)) {
    return candidate[0];
  }
  return typeof candidate === 'string' ? candidate : undefined;
}

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  const rawToken = event.authorizationToken || '';
  const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;

  try {
    const claims = await verifyToken(token);

    if (claims.token_use !== 'id' && claims.token_use !== 'access') {
      throw new Error(`Unsupported token_use: ${claims.token_use}`);
    }

    const clientId = getClientId(claims);
    if (allowedClientIds.length > 0 && (!clientId || !allowedClientIds.includes(clientId))) {
      throw new Error('Token was not issued to an allowed app client');
    }

    if (!claims.sub) {
      throw new Error('Token has no subject');
    }

    return generateAllowPolicy(claims.sub, event.methodArn, claims.email);
  } catch (err) {
    // Log the reason only — never the token or its claims.
    console.warn('Rejecting request:', err instanceof Error ? err.message : 'unknown error');
    // Throwing exactly "Unauthorized" makes API Gateway return 401 (a Deny policy gives 403).
    throw new Error('Unauthorized');
  }
};

function generateAllowPolicy(principalId: string, resource: string, email?: string): APIGatewayAuthorizerResult {
  // Allow every method in this stage so the cached policy covers all endpoints.
  const parts = resource.split('/');
  const wildcardResource = `${parts[0]}/${parts[1]}/*/*`;
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: wildcardResource }],
    },
    context: {
      userId: principalId,
      ...(email ? { email } : {}),
    },
  };
}
