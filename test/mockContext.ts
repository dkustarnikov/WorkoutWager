import type { Context } from 'aws-lambda';

/**
 * A static Lambda context for unit tests.
 *
 * Replaces `aws-lambda-mock-context`, which starts a 3 s timeout per context and
 * throws an uncaught error when a test never "finishes" the context — that crashed
 * Jest workers at random. This object has no timers.
 */
export function context(overrides: Partial<Context> = {}): Context {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'goalpledge-test',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:000000000000:function:goalpledge-test',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/goalpledge-test',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30_000,
    done: () => undefined,
    fail: () => undefined,
    succeed: () => undefined,
    ...overrides,
  };
}
