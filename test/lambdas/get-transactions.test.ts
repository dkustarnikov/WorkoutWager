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

import { handler } from '../../src/lambdas/get-transactions';
import { GOAL_ID } from '../fixtures';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockTransactions = [
  { transactionId: 'tx-1', goalId: GOAL_ID, outcome: 'reward', timestamp: '2099-06-01T00:00:00.000Z' },
  { transactionId: 'tx-2', goalId: GOAL_ID, outcome: 'penalty', timestamp: '2099-01-01T00:00:00.000Z' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /goal/{goalId}/transactions (get-transactions)', () => {
  let ctx: any;

  beforeAll(() => {
    ctx = context();
  });

  it('returns 400 when goalId path parameter is missing', async () => {
    const event = getMockEvent();
    event.pathParameters = null;

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/missing/i);
  });

  it('returns 200 with an empty array when there are no transactions', async () => {
    mockDynamoQuery.mockResolvedValueOnce({ Items: [] });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('returns 200 with empty array when Items is undefined', async () => {
    mockDynamoQuery.mockResolvedValueOnce({});

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([]);
  });

  it('returns 200 with transactions when they exist', async () => {
    mockDynamoQuery.mockResolvedValueOnce({ Items: mockTransactions });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toHaveLength(2);
    expect(body[0].transactionId).toBe('tx-1');
  });

  it('returns 500 when DynamoDB throws an error', async () => {
    mockDynamoQuery.mockRejectedValueOnce(new Error('Table not found'));

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
