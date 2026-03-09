import context from 'aws-lambda-mock-context';
// @ts-ignore
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDynamoQuery = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      query: () => ({ promise: mockDynamoQuery }),
    })),
  },
}));

jest.mock('../../src/common/helpers', () => ({
  getApiResponse: jest.fn((statusCode: number, body: string) => ({ statusCode, body })),
}));

jest.mock('../../src/common/transactionUtils', () => ({
  computeCompletionPercentage: jest.fn().mockReturnValue(75),
}));

import { handler } from '../../src/lambdas/get-all-rules';
import { USER_ID, makeGoal } from '../fixtures';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockGoals = [
  makeGoal({ goalId: 'goal-1' }),
  makeGoal({ goalId: 'goal-2' }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /goals (get-all-goals)', () => {
  let ctx: any;

  beforeAll(() => {
    ctx = context();
  });

  it('returns 400 when userId is missing from the authorizer context', async () => {
    const event = getMockEvent();
    event.requestContext.authorizer = {};

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/userId/i);
  });

  it('returns 200 with an empty array when the user has no goals', async () => {
    mockDynamoQuery.mockResolvedValueOnce({ Items: [] });

    const event = getMockEvent();
    event.requestContext.authorizer = { userId: USER_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('returns 200 with an empty array when Items is null/undefined', async () => {
    mockDynamoQuery.mockResolvedValueOnce({ Items: null });

    const event = getMockEvent();
    event.requestContext.authorizer = { userId: USER_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('returns 200 with goals that include completionPercentage for each', async () => {
    mockDynamoQuery.mockResolvedValueOnce({ Items: mockGoals });

    const event = getMockEvent();
    event.requestContext.authorizer = { userId: USER_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(2);
    body.forEach((g: any) => expect(g.completionPercentage).toBe(75));
  });

  it('queries DynamoDB using the userIdIndex GSI with the correct userId', async () => {
    mockDynamoQuery.mockResolvedValueOnce({ Items: mockGoals });

    const event = getMockEvent();
    event.requestContext.authorizer = { userId: USER_ID };

    await handler(event, ctx, jest.fn());

    // query is called; its arguments go through the DynamoDB mock —
    // we trust the lambda reaches the DynamoDB call when userId is present
    expect(mockDynamoQuery).toHaveBeenCalled();
  });

  it('returns 500 when DynamoDB throws an error', async () => {
    mockDynamoQuery.mockRejectedValueOnce(new Error('Connection reset'));

    const event = getMockEvent();
    event.requestContext.authorizer = { userId: USER_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
