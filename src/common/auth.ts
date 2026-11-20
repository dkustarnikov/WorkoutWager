import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Identity helpers. The API Gateway Lambda authorizer verifies the Cognito JWT and
 * puts the user's Cognito `sub` into `requestContext.authorizer.userId`.
 * That is the ONLY trusted source of identity — never a userId sent in the body.
 */

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
});

/** The authenticated caller's Cognito `sub`, or undefined if missing. */
export function getCallerId(event: Pick<APIGatewayProxyEvent, 'requestContext'>): string | undefined {
  const authorizer = event.requestContext?.authorizer ?? {};
  const id = authorizer.userId ?? authorizer.principalId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** The caller's email from the verified token, if the authorizer passed it through. */
export function getCallerEmail(event: Pick<APIGatewayProxyEvent, 'requestContext'>): string | undefined {
  const email = event.requestContext?.authorizer?.email;
  return typeof email === 'string' && email.length > 0 ? email : undefined;
}

/** True when the record belongs to the caller. */
export function isOwner(record: { userId?: string } | undefined, callerId: string): boolean {
  return !!record && record.userId === callerId;
}

export const unauthorizedResponse = () => json(401, { message: 'Unauthorized' });

/**
 * Returned both when a goal doesn't exist and when it belongs to someone else,
 * so callers can't probe for other users' goal IDs.
 */
export const goalNotFoundResponse = () => json(404, { message: 'Goal not found' });
