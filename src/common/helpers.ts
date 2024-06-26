import axios from 'axios';
import jwkToPem from 'jwk-to-pem';
import * as jwt from 'jsonwebtoken';

export function getApiResponse(statusCode: number, body: string) {
  return {
    statusCode,
    body,
    headers: {
      'Content-Type': 'application/json',
    },
  };
}

interface CachedKeys {
  [key: string]: string;
}

let cachedKeys: CachedKeys | null = null;

const fetchJwks = async (userPoolId: string, region: string): Promise<CachedKeys> => {
  if (!cachedKeys) {
    const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const response = await axios.get(url);
    const keys = response.data.keys;
    cachedKeys = {};
    keys.forEach((key: any) => {
      cachedKeys![key.kid] = jwkToPem(key);
    });
  }
  return cachedKeys!;
};

export const verifyJwtToken = async (token: string, userPoolId: string, region: string): Promise<any> => {
  const decodedHeader: any = jwt.decode(token, { complete: true });
  if (!decodedHeader) {
    throw new Error('Invalid token');
  }

  const kid = decodedHeader.header.kid;
  const keys = await fetchJwks(userPoolId, region);

  if (!keys[kid]) {
    throw new Error('Invalid token');
  }

  try {
    const decodedToken = jwt.verify(token, keys[kid], { algorithms: ['RS256'] });
    return decodedToken;
  } catch (error) {
    console.error('JWT verification failed:', error);
    throw new Error('Invalid token');
  }
};