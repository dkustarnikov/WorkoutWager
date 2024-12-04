import axios from 'axios';
import * as jwt from 'jsonwebtoken';
// eslint-disable-next-line import/no-extraneous-dependencies
import jwkToPem from 'jwk-to-pem';
import * as yup from 'yup';

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

export const milestoneSchema = yup.object().shape({
  milestoneName: yup.string().required('Milestone name is required'),
  type: yup.string().required('Milestone type is required'),
  completion: yup.boolean().required('Milestone completion status is required'),
  milestoneDeadline: yup.string().required('Milestone deadline is required').matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
    'Milestone deadline must be a valid ISO 8601 date string',
  ),
  monetaryValue: yup.number().required('Milestone monetary value is required').positive('Monetary value must be positive'),
});

export const ruleSchema = yup.object().shape({
  userId: yup.string().required('User ID is required'),
  ruleType: yup.string().required('Rule type is required'),
  ruleName: yup.string().required('Rule name is required'),
  generalObjective: yup.string().required('General objective is required'),
  totalAmount: yup.number().required('Total amount is required').positive('Total amount must be positive'),
  deadline: yup.string().required('Deadline is required').matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
    'Deadline must be a valid ISO 8601 date string',
  ),
  milestones: yup.array().of(milestoneSchema).required('Milestones are required'),
});

export function convertToCronExpression(isoString: string): string {
  const date = new Date(isoString);
  const minutes = date.getUTCMinutes();
  const hours = date.getUTCHours();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1; // getUTCMonth returns 0-11, so we add 1
  const year = date.getUTCFullYear();

  // Ensure all values are within valid ranges
  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23 || dayOfMonth < 1 || dayOfMonth > 31 || month < 1 || month > 12) {
    throw new Error('Invalid date for cron expression');
  }

  return `${minutes} ${hours} ${dayOfMonth} ${month} ? ${year}`;
}