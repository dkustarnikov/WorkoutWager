import { handler } from '../../src/lambdas/milestone-handler';

// ---------------------------------------------------------------------------
// Mocks — DynamoDB and EventBridge only; settlement logic is real.
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
import { GOAL_ID, MS_ID_1, MS_ID_2, MS_ID_3, makeGoal, makeMilestone, makeSQSEvent } from '../fixtures';

const forfeits = () => mockDynamoUpdate.mock.calls
  .map(([p]: any[]) => p)
  .filter((p: any) => p.UpdateExpression === 'SET pendingBalance = pendingBalance - :amount')
  .map((p: any) => p.ExpressionAttributeValues[':amount']);
const transactions = () => mockDynamoPut.mock.calls.map(([p]: any[]) => p.Item).filter((i: any) => i.transactionId);
const savedGoal = () => mockDynamoPut.mock.calls.map(([p]: any[]) => p.Item).filter((i: any) => i.goalId && !i.transactionId).pop();

const deadline = (milestoneId = MS_ID_1) => makeSQSEvent({ goalId: GOAL_ID, milestoneId });

describe('milestone-handler (deadline reached)', () => {
  beforeEach(() => {
    mockDynamoPut.mockResolvedValue({});
    mockDynamoUpdate.mockResolvedValue({});
    mockRemoveTargets.mockResolvedValue({});
    mockDeleteRule.mockResolvedValue({});
  });

  it('ignores messages without goalId or milestoneId', async () => {
    await handler(makeSQSEvent({ goalId: GOAL_ID }));
    expect(mockDynamoGet).not.toHaveBeenCalled();
  });

  it('skips goals that no longer exist', async () => {
    mockDynamoGet.mockResolvedValueOnce({});
    await handler(deadline());
    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  it.each([GoalStatus.completed, GoalStatus.failed, GoalStatus.cancelled])('skips a %s goal', async (status) => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status }) });
    await handler(deadline());
    expect(mockDynamoUpdate).not.toHaveBeenCalled();
    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  it('skips a milestone that was already completed', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
    });
    await handler(deadline(MS_ID_1));
    expect(mockDynamoUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent: a retried message for an already-missed milestone forfeits nothing again', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, false), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
    });
    await handler(deadline(MS_ID_1));
    expect(forfeits()).toEqual([]);
    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  describe('per-milestone goal', () => {
    it('marks the milestone missed and forfeits only its stake', async () => {
      mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal() }); // two $50 milestones
      await handler(deadline(MS_ID_1));

      expect(forfeits()).toEqual([50]);
      expect(transactions()[0].outcome).toBe('lost');
      expect(savedGoal().milestones[0].completion).toBe(false);
      expect(savedGoal().status).toBe(GoalStatus.inProgress);
    });

    it('resolves the goal as "mixed" when the last milestone is missed after a win', async () => {
      mockDynamoGet.mockResolvedValueOnce({
        Item: makeGoal({ status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
      });
      await handler(deadline(MS_ID_2));

      expect(transactions()[0].outcome).toBe('mixed');
      expect(savedGoal().status).toBe(GoalStatus.completed);
    });

    it('resolves the goal as "lost" when every milestone was missed', async () => {
      mockDynamoGet.mockResolvedValueOnce({
        Item: makeGoal({ status: GoalStatus.inProgress, milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, false), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
      });
      await handler(deadline(MS_ID_2));

      expect(transactions()[0].outcome).toBe('lost');
      expect(savedGoal().status).toBe(GoalStatus.completed);
    });
  });

  describe('all-or-nothing goal', () => {
    it('fails the goal, forfeits the whole stake, and removes the remaining deadline rules', async () => {
      mockDynamoGet.mockResolvedValueOnce({
        Item: makeGoal({
          allOrNothing: true,
          stake: 90,
          milestones: [
            makeMilestone(MS_ID_1, 'Week 1', 30),
            makeMilestone(MS_ID_2, 'Week 2', 30),
            makeMilestone(MS_ID_3, 'Week 3', 30),
          ],
        }),
      });
      await handler(deadline(MS_ID_1));

      expect(forfeits()).toEqual([90]);
      expect(savedGoal().status).toBe(GoalStatus.failed);
      expect(savedGoal().milestones.every((m: any) => m.completion === false)).toBe(true);
      expect(mockDeleteRule).toHaveBeenCalledTimes(2); // ms-2 and ms-3
      expect(transactions()[0].outcome).toBe('lost');
    });
  });

  it('rethrows DynamoDB errors so SQS retries the message', async () => {
    mockDynamoGet.mockRejectedValueOnce(new Error('throttled'));
    await expect(handler(deadline())).rejects.toThrow('throttled');
  });
});
