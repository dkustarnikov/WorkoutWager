import { handler } from '../../src/lambdas/complete-milestone';
import { context } from '../mockContext';
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks — DynamoDB and EventBridge only. Settlement logic (transactionUtils) is real,
// so these tests check the actual money movements.
// ---------------------------------------------------------------------------

const mockDynamoGet = jest.fn();
const mockDynamoPut = jest.fn();
const mockDynamoUpdate = jest.fn();
const mockRemoveTargets = jest.fn();
const mockDeleteRule = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      get: (params: unknown) => ({ promise: () => mockDynamoGet(params) }),
      put: (params: unknown) => ({ promise: () => mockDynamoPut(params) }),
      update: (params: unknown) => ({ promise: () => mockDynamoUpdate(params) }),
    })),
  },
  EventBridge: jest.fn(() => ({
    removeTargets: () => ({ promise: mockRemoveTargets }),
    deleteRule: () => ({ promise: mockDeleteRule }),
  })),
}));

import { GoalStatus } from '../../src/common/models';
import { GOAL_ID, MS_ID_1, MS_ID_2, makeGoal, makeMilestone } from '../fixtures';

/** Balance updates in call order, as [UpdateExpression, amount]. */
const balanceUpdates = () => mockDynamoUpdate.mock.calls.map(([p]: any[]) => [p.UpdateExpression, p.ExpressionAttributeValues[':amount']]);
/** Items written to the Transactions table. */
const transactions = () => mockDynamoPut.mock.calls.map(([p]: any[]) => p.Item).filter((i: any) => i.transactionId);
/** The last goal written. */
const savedGoal = () => mockDynamoPut.mock.calls.map(([p]: any[]) => p.Item).filter((i: any) => i.goalId && !i.transactionId).pop();

const completeEvent = (milestoneId = MS_ID_1) => {
  const event = getMockEvent();
  event.pathParameters = { goalId: GOAL_ID, milestoneId };
  return event;
};

describe('POST /goal/{goalId}/milestone/{milestoneId}/complete (complete-milestone)', () => {
  const ctx = context();

  beforeEach(() => {
    mockDynamoPut.mockResolvedValue({});
    mockDynamoUpdate.mockResolvedValue({});
    mockRemoveTargets.mockResolvedValue({});
    mockDeleteRule.mockResolvedValue({});
  });

  it('returns 400 when path parameters are missing', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    const result = await handler(event, ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(400);
  });

  it('returns 401 without a caller identity', async () => {
    const event = completeEvent();
    event.requestContext.authorizer = {};
    const result = await handler(event, ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(401);
  });

  it("returns 404 for another user's goal and moves no money", async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal() });
    const event = completeEvent();
    event.requestContext.authorizer = { userId: 'someone-else' };
    const result = await handler(event, ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(404);
    expect(mockDynamoUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the milestone does not exist', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal() });
    const result = await handler(completeEvent('nope'), ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(404);
  });

  it.each([GoalStatus.completed, GoalStatus.failed, GoalStatus.cancelled])('returns 400 for a %s goal', async (status) => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status }) });
    const result = await handler(completeEvent(), ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for a milestone that was already missed', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, false), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
    });
    const result = await handler(completeEvent(), ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(400);
    expect(mockDynamoUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent: completing an already-completed milestone moves no money', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
    });
    const result = await handler(completeEvent(), ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(200);
    expect(mockDynamoUpdate).not.toHaveBeenCalled();
    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  describe('per-milestone goal', () => {
    it('refunds that milestone’s stake plus 10% stars, and starts the goal', async () => {
      mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal() }); // ms-1 $50, ms-2 $50, status created
      const result = await handler(completeEvent(MS_ID_1), ctx, jest.fn()) as any;

      expect(result.statusCode).toBe(200);
      expect(balanceUpdates()).toEqual([
        [expect.stringContaining('balance = if_not_exists(balance, :zero) + :amount'), 50], // release
        [expect.stringContaining('stars = if_not_exists(stars, :zero) + :amount'), 5], // stars
      ]);
      expect(transactions()).toHaveLength(1);
      expect(transactions()[0].outcome).toBe('won');
      expect(savedGoal().status).toBe(GoalStatus.inProgress);
      expect(savedGoal().milestones[0].completion).toBe(true);
      expect(mockDeleteRule).toHaveBeenCalledTimes(1); // the deadline rule is no longer needed
    });

    it('resolves the goal as "won" when the last milestone is completed', async () => {
      mockDynamoGet.mockResolvedValueOnce({
        Item: makeGoal({ status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
      });
      const result = await handler(completeEvent(MS_ID_2), ctx, jest.fn()) as any;

      expect(JSON.parse(result.body).outcome).toBe('won');
      expect(savedGoal().status).toBe(GoalStatus.completed);
    });

    it('resolves the goal as "mixed" when an earlier milestone was missed', async () => {
      mockDynamoGet.mockResolvedValueOnce({
        Item: makeGoal({ status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, false), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
      });
      const result = await handler(completeEvent(MS_ID_2), ctx, jest.fn()) as any;

      expect(JSON.parse(result.body).outcome).toBe('mixed');
      expect(savedGoal().status).toBe(GoalStatus.completed);
    });
  });

  describe('all-or-nothing goal', () => {
    it('moves no money until the last milestone is completed', async () => {
      mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ allOrNothing: true }) });
      const result = await handler(completeEvent(MS_ID_1), ctx, jest.fn()) as any;

      expect(result.statusCode).toBe(200);
      expect(mockDynamoUpdate).not.toHaveBeenCalled();
      expect(transactions()).toHaveLength(0);
      expect(savedGoal().status).toBe(GoalStatus.inProgress);
    });

    it('refunds the whole stake plus stars when the last milestone is completed', async () => {
      mockDynamoGet.mockResolvedValueOnce({
        Item: makeGoal({ allOrNothing: true, status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
      });
      const result = await handler(completeEvent(MS_ID_2), ctx, jest.fn()) as any;

      expect(JSON.parse(result.body).outcome).toBe('won');
      expect(balanceUpdates()).toEqual([[expect.any(String), 100], [expect.any(String), 10]]);
      expect(savedGoal().status).toBe(GoalStatus.completed);
    });
  });

  it('returns 500 (without internal details) when DynamoDB fails', async () => {
    mockDynamoGet.mockRejectedValueOnce(new Error('secret internal detail'));
    const result = await handler(completeEvent(), ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain('secret internal detail');
  });
});
