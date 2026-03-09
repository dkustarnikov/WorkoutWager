import context from 'aws-lambda-mock-context';
// @ts-ignore
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks (must be declared before imports that use them)
// ---------------------------------------------------------------------------

const mockDynamoGet = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      get: () => ({ promise: mockDynamoGet }),
    })),
  },
}));

jest.mock('../../src/common/helpers', () => ({
  getApiResponse: jest.fn((statusCode: number, body: string) => ({ statusCode, body })),
}));

jest.mock('../../src/common/transactionUtils', () => ({
  computeCompletionPercentage: jest.fn().mockReturnValue(50),
}));

import { handler } from '../../src/lambdas/get-rule-by-id';
import { GOAL_ID, makeGoal } from '../fixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /goal/{goalId} (get-goal-by-id)', () => {
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

  it('returns 404 when the goal does not exist in DynamoDB', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: undefined });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toMatch(/not found/i);
  });

  it('returns 200 with the goal object including completionPercentage', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal() });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.goalId).toBe(GOAL_ID);
    expect(body.completionPercentage).toBe(50);
  });

  it('returns 500 when DynamoDB throws an error', async () => {
    mockDynamoGet.mockRejectedValueOnce(new Error('DynamoDB error'));

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
