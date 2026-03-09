import context from 'aws-lambda-mock-context';
// @ts-ignore
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDynamoGet = jest.fn();
const mockDynamoDelete = jest.fn();
const mockEventBridgeRemoveTargets = jest.fn();
const mockEventBridgeDeleteRule = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      get: () => ({ promise: mockDynamoGet }),
      delete: () => ({ promise: mockDynamoDelete }),
    })),
  },
  EventBridge: jest.fn(() => ({
    removeTargets: () => ({ promise: mockEventBridgeRemoveTargets }),
    deleteRule: () => ({ promise: mockEventBridgeDeleteRule }),
  })),
}));

jest.mock('../../src/common/helpers', () => ({
  getApiResponse: jest.fn((statusCode: number, body: string) => ({ statusCode, body })),
}));

import { handler } from '../../src/lambdas/delete-rule';
import { GOAL_ID, makeGoal } from '../fixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /goal/{goalId} (delete-goal)', () => {
  let ctx: any;

  beforeAll(() => {
    ctx = context();
  });

  beforeEach(() => {
    mockDynamoGet.mockResolvedValue({ Item: makeGoal() });
    mockDynamoDelete.mockResolvedValue({});
    mockEventBridgeRemoveTargets.mockResolvedValue({});
    mockEventBridgeDeleteRule.mockResolvedValue({});
  });

  it('returns 400 when goalId path parameter is missing', async () => {
    const event = getMockEvent();
    event.pathParameters = null;

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when the goal does not exist', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: undefined });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(404);
  });

  it('returns 200 and deletes the goal successfully', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(mockDynamoDelete).toHaveBeenCalled();
  });

  it('cancels EventBridge rules for each milestone on delete', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    await handler(event, ctx, jest.fn());

    // 2 milestones → removeTargets and deleteRule called twice each
    expect(mockEventBridgeRemoveTargets).toHaveBeenCalledTimes(2);
    expect(mockEventBridgeDeleteRule).toHaveBeenCalledTimes(2);
  });

  it('still returns 200 even if EventBridge rule cleanup fails (silently ignored)', async () => {
    mockEventBridgeRemoveTargets.mockRejectedValue(new Error('Rule not found'));
    mockEventBridgeDeleteRule.mockRejectedValue(new Error('Rule not found'));

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    // Error is swallowed; the goal is still deleted
    expect(result.statusCode).toBe(200);
    expect(mockDynamoDelete).toHaveBeenCalled();
  });

  it('returns 500 when DynamoDB delete throws an error', async () => {
    mockDynamoDelete.mockRejectedValueOnce(new Error('Write failed'));

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
