import context from 'aws-lambda-mock-context';
// @ts-ignore
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDynamoGet = jest.fn();
const mockDynamoPut = jest.fn();
const mockEventBridgeRemoveTargets = jest.fn();
const mockEventBridgeDeleteRule = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      get: () => ({ promise: mockDynamoGet }),
      put: () => ({ promise: mockDynamoPut }),
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

import { handler } from '../../src/lambdas/cancel-goal';
import { GoalStatus } from '../../src/common/models';
import { GOAL_ID, MS_ID_1, MS_ID_2, MS_ID_3, makeGoal, makeMilestone } from '../fixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /goal/{goalId}/cancel (cancel-goal)', () => {
  let ctx: any;

  beforeAll(() => {
    ctx = context();
  });

  beforeEach(() => {
    mockDynamoPut.mockResolvedValue({});
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

  it('returns 400 when the goal is already completed', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status: GoalStatus.completed }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/completed/i);
  });

  it('returns 400 when the goal has already failed', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status: GoalStatus.failed }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when the goal is already cancelled', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status: GoalStatus.cancelled }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 200 and sets goal status to cancelled', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones: [] }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.goal.status).toBe('cancelled');
  });

  it('cancels EventBridge rules for each pending milestone', async () => {
    const milestones = [
      makeMilestone(MS_ID_1, 'Week 1', 50),         // pending — rule should be cancelled
      makeMilestone(MS_ID_2, 'Week 2', 50, true),    // completed — rule already gone
      makeMilestone(MS_ID_3, 'Week 3', 50, false),   // missed — rule already gone
      makeMilestone('ms-4', 'Week 4', 50),           // pending — rule should be cancelled
    ];
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    await handler(event, ctx, jest.fn());

    // Only the 2 pending milestones should trigger EventBridge cleanup
    expect(mockEventBridgeRemoveTargets).toHaveBeenCalledTimes(2);
    expect(mockEventBridgeDeleteRule).toHaveBeenCalledTimes(2);
  });

  it('continues cancellation even if an EventBridge call fails (silently ignored)', async () => {
    mockEventBridgeRemoveTargets.mockRejectedValue(new Error('Rule not found'));
    mockEventBridgeDeleteRule.mockRejectedValue(new Error('Rule not found'));
    const milestones = [makeMilestone(MS_ID_1, 'Week 1', 50), makeMilestone(MS_ID_2, 'Week 2', 50)];
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    // Goal is still cancelled despite EventBridge errors
    expect(result.statusCode).toBe(200);
    expect(mockDynamoPut).toHaveBeenCalled();
  });

  it('does not write a transaction (no financial consequence on cancel)', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones: [] }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    await handler(event, ctx, jest.fn());

    // Only DynamoDB put (goal update) — no Transactions table put
    expect(mockDynamoPut).toHaveBeenCalledTimes(1);
  });

  it('returns 500 on DynamoDB error', async () => {
    mockDynamoGet.mockRejectedValueOnce(new Error('DB timeout'));

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
