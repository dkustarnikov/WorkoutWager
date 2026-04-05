import { Goal, GoalStatus } from '../../src/common/models';
import {
  allMilestonesResolved,
  buildTransactionEntries,
  computeCompletionPercentage,
  updateGoalStatus,
  writeTransaction,
} from '../../src/common/transactionUtils';
import { makeGoal, makeMilestone, MS_ID_1, MS_ID_2 } from '../fixtures';

// ---------------------------------------------------------------------------
// computeCompletionPercentage
// ---------------------------------------------------------------------------

describe('computeCompletionPercentage', () => {
  it('returns 0 for an empty milestones array', () => {
    expect(computeCompletionPercentage([])).toBe(0);
  });

  it('returns 0 when all milestones are pending (undefined completion)', () => {
    expect(computeCompletionPercentage([{}, {}, {}])).toBe(0);
  });

  it('returns 0 when all milestones are missed (completion = false)', () => {
    expect(computeCompletionPercentage([{ completion: false }, { completion: false }])).toBe(0);
  });

  it('returns 100 when all milestones are completed', () => {
    expect(computeCompletionPercentage([{ completion: true }, { completion: true }])).toBe(100);
  });

  it('returns 50 when half of milestones are completed', () => {
    expect(computeCompletionPercentage([{ completion: true }, { completion: false }])).toBe(50);
  });

  it('returns 33.3 for one out of three completed', () => {
    expect(
      computeCompletionPercentage([{ completion: true }, { completion: false }, {}]),
    ).toBe(33.3);
  });

  it('does not count undefined completion as completed', () => {
    expect(computeCompletionPercentage([{}, { completion: true }])).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// allMilestonesResolved
// ---------------------------------------------------------------------------

describe('allMilestonesResolved', () => {
  it('returns true for an empty milestones array', () => {
    expect(allMilestonesResolved([])).toBe(true);
  });

  it('returns false when all milestones are pending', () => {
    expect(allMilestonesResolved([{}, {}])).toBe(false);
  });

  it('returns false when at least one milestone is still pending', () => {
    expect(allMilestonesResolved([{ completion: true }, {}])).toBe(false);
  });

  it('returns true when all milestones are completed (true)', () => {
    expect(allMilestonesResolved([{ completion: true }, { completion: true }])).toBe(true);
  });

  it('returns true when all milestones are missed (false)', () => {
    expect(allMilestonesResolved([{ completion: false }, { completion: false }])).toBe(true);
  });

  it('returns true for a mix of completed and missed', () => {
    expect(allMilestonesResolved([{ completion: true }, { completion: false }])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildTransactionEntries — allOrNothing = true
// ---------------------------------------------------------------------------

describe('buildTransactionEntries (allOrNothing = true)', () => {
  it('returns a full penalty when any milestone is missed', () => {
    const goal: Goal = makeGoal({
      allOrNothing: true,
      totalAmount: 100,
      penaltyInterestRate: 20,
      milestones: [
        makeMilestone(MS_ID_1, 'Week 1', 50, true),
        makeMilestone(MS_ID_2, 'Week 2', 50, false),
      ],
    });

    const { entries, outcome } = buildTransactionEntries(goal);

    expect(outcome).toBe('penalty');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('penalty');
    expect(entries[0].amount).toBe(120); // 100 * (1 + 20/100)
    expect(entries[0].destination).toBe('charity');
  });

  it('returns a reward when all milestones are completed', () => {
    const goal: Goal = makeGoal({
      allOrNothing: true,
      totalAmount: 100,
      milestones: [
        makeMilestone(MS_ID_1, 'Week 1', 50, true),
        makeMilestone(MS_ID_2, 'Week 2', 50, true),
      ],
    });

    const { entries, outcome } = buildTransactionEntries(goal);

    expect(outcome).toBe('reward');
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('reward');
    expect(entries[0].amount).toBe(100);
    expect(entries[0].destination).toBe('savings');
  });

  it('applies 0% penalty interest correctly (no extra charge)', () => {
    const goal: Goal = makeGoal({
      allOrNothing: true,
      totalAmount: 200,
      penaltyInterestRate: 0,
      milestones: [makeMilestone(MS_ID_1, 'Week 1', 200, false)],
    });

    const { entries } = buildTransactionEntries(goal);
    expect(entries[0].amount).toBe(200);
  });

  it('applies 50% penalty interest correctly', () => {
    const goal: Goal = makeGoal({
      allOrNothing: true,
      totalAmount: 100,
      penaltyInterestRate: 50,
      milestones: [makeMilestone(MS_ID_1, 'Week 1', 100, false)],
    });

    const { entries } = buildTransactionEntries(goal);
    expect(entries[0].amount).toBe(150); // 100 * 1.5
  });
});

// ---------------------------------------------------------------------------
// buildTransactionEntries — allOrNothing = false
// ---------------------------------------------------------------------------

describe('buildTransactionEntries (allOrNothing = false)', () => {
  it('returns a reward entry per completed milestone', () => {
    const goal: Goal = makeGoal({
      milestones: [
        makeMilestone(MS_ID_1, 'Week 1', 50, true),
        makeMilestone(MS_ID_2, 'Week 2', 50, true),
      ],
    });

    const { entries, outcome } = buildTransactionEntries(goal);

    expect(outcome).toBe('reward');
    expect(entries).toHaveLength(2);
    entries.forEach(e => {
      expect(e.type).toBe('reward');
      expect(e.amount).toBe(50);
    });
  });

  it('returns a penalty entry per missed milestone with interest', () => {
    const goal: Goal = makeGoal({
      penaltyInterestRate: 10,
      milestones: [
        makeMilestone(MS_ID_1, 'Week 1', 50, false),
        makeMilestone(MS_ID_2, 'Week 2', 50, false),
      ],
    });

    const { entries, outcome } = buildTransactionEntries(goal);

    expect(outcome).toBe('penalty');
    expect(entries).toHaveLength(2);
    entries.forEach(e => {
      expect(e.type).toBe('penalty');
      expect(e.amount).toBe(50 * 1.10); // 50 * 1.10
    });
  });

  it('returns mixed outcome for partial completion', () => {
    const goal: Goal = makeGoal({
      penaltyInterestRate: 20,
      milestones: [
        makeMilestone(MS_ID_1, 'Week 1', 60, true),
        makeMilestone(MS_ID_2, 'Week 2', 40, false),
      ],
    });

    const { entries, outcome } = buildTransactionEntries(goal);

    expect(outcome).toBe('mixed');
    expect(entries).toHaveLength(2);
    expect(entries[0].type).toBe('reward');
    expect(entries[0].amount).toBe(60);
    expect(entries[1].type).toBe('penalty');
    expect(entries[1].amount).toBe(48); // 40 * 1.20
  });

  it('skips pending milestones (undefined completion)', () => {
    const goal: Goal = makeGoal({
      milestones: [
        makeMilestone(MS_ID_1, 'Week 1', 50, true),
        makeMilestone(MS_ID_2, 'Week 2', 50), // pending — should not generate entry
      ],
    });

    const { entries } = buildTransactionEntries(goal);

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe('reward');
  });
});

// ---------------------------------------------------------------------------
// writeTransaction
// ---------------------------------------------------------------------------

describe('writeTransaction', () => {
  const mockPutPromise = jest.fn();
  const mockDynamoDb = {
    put: jest.fn(() => ({ promise: mockPutPromise })),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPutPromise.mockResolvedValue({});
  });

  it('calls DynamoDB put with a complete, valid transaction item', async () => {
    const goal: Goal = makeGoal({
      milestones: [makeMilestone(MS_ID_1, 'Week 1', 100, true)],
    });
    const entries = [{ type: 'reward' as const, destination: 'savings', amount: 100, reason: 'test' }];

    await writeTransaction(mockDynamoDb, 'Transactions', goal, entries, 'reward');

    expect(mockDynamoDb.put).toHaveBeenCalledTimes(1);
    const item = mockDynamoDb.put.mock.calls[0][0].Item;
    expect(item.goalId).toBe('goal-123');
    expect(item.userId).toBe('user-456');
    expect(item.outcome).toBe('reward');
    expect(item.entries).toEqual(entries);
    expect(item.transactionId).toBeDefined();
    expect(item.timestamp).toBeDefined();
  });

  it('records milestonesSummary counts correctly', async () => {
    const goal: Goal = makeGoal({
      milestones: [
        makeMilestone(MS_ID_1, 'Week 1', 50, true),
        makeMilestone(MS_ID_2, 'Week 2', 50, false),
      ],
    });

    await writeTransaction(mockDynamoDb, 'Transactions', goal, [], 'mixed');

    const item = mockDynamoDb.put.mock.calls[0][0].Item;
    expect(item.milestonesSummary.total).toBe(2);
    expect(item.milestonesSummary.completed).toBe(1);
    expect(item.milestonesSummary.missed).toBe(1);
  });

  it('includes a goalSnapshot with key goal fields', async () => {
    const goal: Goal = makeGoal();

    await writeTransaction(mockDynamoDb, 'Transactions', goal, [], 'reward');

    const item = mockDynamoDb.put.mock.calls[0][0].Item;
    expect(item.goalSnapshot.goalName).toBe('Test Goal');
    expect(item.goalSnapshot.totalAmount).toBe(100);
    expect(item.goalSnapshot.allOrNothing).toBe(false);
    expect(item.goalSnapshot.penaltyInterestRate).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// updateGoalStatus
// ---------------------------------------------------------------------------

describe('updateGoalStatus', () => {
  const mockUpdatePromise = jest.fn();
  const mockDynamoDb = {
    update: jest.fn(() => ({ promise: mockUpdatePromise })),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePromise.mockResolvedValue({});
  });

  it('calls DynamoDB update with the correct key and status', async () => {
    await updateGoalStatus(mockDynamoDb, 'Goals', 'goal-123', GoalStatus.completed);

    expect(mockDynamoDb.update).toHaveBeenCalledTimes(1);
    const params = mockDynamoDb.update.mock.calls[0][0];
    expect(params.TableName).toBe('Goals');
    expect(params.Key).toEqual({ goalId: 'goal-123' });
    expect(params.ExpressionAttributeValues[':status']).toBe(GoalStatus.completed);
  });

  it('includes updatedAt in the update expression', async () => {
    await updateGoalStatus(mockDynamoDb, 'Goals', 'goal-123', GoalStatus.failed);

    const params = mockDynamoDb.update.mock.calls[0][0];
    expect(params.ExpressionAttributeValues[':updatedAt']).toBeDefined();
  });

  it('works with GoalStatus.cancelled', async () => {
    await updateGoalStatus(mockDynamoDb, 'Goals', 'goal-abc', GoalStatus.cancelled);

    const params = mockDynamoDb.update.mock.calls[0][0];
    expect(params.ExpressionAttributeValues[':status']).toBe('cancelled');
  });
});
