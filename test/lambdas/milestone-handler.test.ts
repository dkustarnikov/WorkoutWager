// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDynamoGet = jest.fn();
const mockDynamoPut = jest.fn();
const mockEventBridgeRemoveTargets = jest.fn();
const mockEventBridgeDeleteRule = jest.fn();

const mockAllMilestonesResolved = jest.fn();
const mockBuildTransactionEntries = jest.fn();
const mockWriteTransaction = jest.fn();
const mockUpdateGoalStatus = jest.fn();

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

jest.mock('../../src/common/transactionUtils', () => ({
  allMilestonesResolved: mockAllMilestonesResolved,
  buildTransactionEntries: mockBuildTransactionEntries,
  writeTransaction: mockWriteTransaction,
  updateGoalStatus: mockUpdateGoalStatus,
}));

import { handler } from '../../src/lambdas/milestone-handler';
import { GoalStatus } from '../../src/common/models';
import { GOAL_ID, MS_ID_1, MS_ID_2, MS_ID_3, makeGoal, makeMilestone, makeSQSEvent } from '../fixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('milestone-handler (SQS trigger)', () => {
  beforeEach(() => {
    mockDynamoPut.mockResolvedValue({});
    mockEventBridgeRemoveTargets.mockResolvedValue({});
    mockEventBridgeDeleteRule.mockResolvedValue({});
    mockWriteTransaction.mockResolvedValue(undefined);
    mockUpdateGoalStatus.mockResolvedValue(undefined);
    mockAllMilestonesResolved.mockReturnValue(false);
    mockBuildTransactionEntries.mockReturnValue({ entries: [], outcome: 'penalty' });
  });

  it('skips and continues when the SQS body is missing goalId or milestoneId', async () => {
    const event = makeSQSEvent({ goalId: GOAL_ID }); // milestoneId missing

    await expect(handler(event)).resolves.not.toThrow();
    expect(mockDynamoGet).not.toHaveBeenCalled();
  });

  it('skips when the goal is not found in DynamoDB', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: undefined });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  it('skips when the goal is already completed', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true)], status: GoalStatus.completed }),
    });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  it('skips when the goal is already failed', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, false)], status: GoalStatus.failed }),
    });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  it('skips when the milestone is not found in the goal', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone('ms-other', 'Other', 50)] }),
    });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  it('skips when the milestone was already completed (user beat the deadline)', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true)] }),
    });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    expect(mockDynamoPut).not.toHaveBeenCalled();
  });

  it('marks a milestone as missed and saves when not all milestones are resolved (non-allOrNothing)', async () => {
    const milestones = [makeMilestone(MS_ID_1, 'Week 1', 50), makeMilestone(MS_ID_2, 'Week 2', 50)];
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones }) });
    mockAllMilestonesResolved.mockReturnValueOnce(false);

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    expect(mockDynamoPut).toHaveBeenCalledTimes(1);
    const savedGoal = mockDynamoPut.mock.calls[0][0].Item;
    const missedMs = savedGoal.milestones.find((m: any) => m.milestoneId === MS_ID_1);
    expect(missedMs.completion).toBe(false);
    expect(mockWriteTransaction).not.toHaveBeenCalled();
  });

  it('writes a transaction and resolves the goal when the last milestone is missed (non-allOrNothing)', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50), makeMilestone(MS_ID_2, 'Week 2', 50, true)] }),
    });
    mockAllMilestonesResolved.mockReturnValueOnce(true);
    mockBuildTransactionEntries.mockReturnValueOnce({ entries: [], outcome: 'mixed' });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    expect(mockWriteTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdateGoalStatus).toHaveBeenCalledTimes(1);
  });

  it('triggers full goal failure immediately on first miss when allOrNothing = true', async () => {
    const milestones = [
      makeMilestone(MS_ID_1, 'Week 1', 50),
      makeMilestone(MS_ID_2, 'Week 2', 50),
      makeMilestone(MS_ID_3, 'Week 3', 50),
    ];
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones, allOrNothing: true }) });
    mockBuildTransactionEntries.mockReturnValueOnce({ entries: [], outcome: 'penalty' });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    // Penalty transaction written
    expect(mockWriteTransaction).toHaveBeenCalledTimes(1);

    // Goal saved with failed status
    expect(mockDynamoPut).toHaveBeenCalledTimes(1);
    const savedGoal = mockDynamoPut.mock.calls[0][0].Item;
    expect(savedGoal.status).toBe('failed');
  });

  it('marks all remaining pending milestones as missed when allOrNothing triggers failure', async () => {
    const milestones = [
      makeMilestone(MS_ID_1, 'Week 1', 50),         // the one that triggered failure
      makeMilestone(MS_ID_2, 'Week 2', 50, true),    // already completed — should stay true
      makeMilestone(MS_ID_3, 'Week 3', 50),          // still pending — should become false
    ];
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones, allOrNothing: true }) });
    mockBuildTransactionEntries.mockReturnValueOnce({ entries: [], outcome: 'penalty' });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    const savedGoal = mockDynamoPut.mock.calls[0][0].Item;
    const ms2 = savedGoal.milestones.find((m: any) => m.milestoneId === MS_ID_2);
    const ms3 = savedGoal.milestones.find((m: any) => m.milestoneId === MS_ID_3);
    expect(ms2.completion).toBe(true); // preserved
    expect(ms3.completion).toBe(false); // marked missed
  });

  it('cancels EventBridge rules for all remaining pending milestones when allOrNothing fails', async () => {
    const milestones = [
      makeMilestone(MS_ID_1, 'Week 1', 50),         // the miss that triggered failure
      makeMilestone(MS_ID_2, 'Week 2', 50, true),    // already completed — no rule to cancel
      makeMilestone(MS_ID_3, 'Week 3', 50),          // still pending — rule should be cancelled
    ];
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones, allOrNothing: true }) });
    mockBuildTransactionEntries.mockReturnValueOnce({ entries: [], outcome: 'penalty' });

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await handler(event);

    // Only ms-3 (the remaining pending one) triggers EventBridge cleanup
    // ms-1 is already being marked missed, ms-2 is already done
    expect(mockEventBridgeRemoveTargets).toHaveBeenCalledTimes(1);
    expect(mockEventBridgeDeleteRule).toHaveBeenCalledTimes(1);
  });

  it('rethrows errors so SQS retries the message', async () => {
    mockDynamoGet.mockRejectedValueOnce(new Error('DB connection failed'));

    const event = makeSQSEvent({ goalId: GOAL_ID, milestoneId: MS_ID_1 });

    await expect(handler(event)).rejects.toThrow('DB connection failed');
  });
});
