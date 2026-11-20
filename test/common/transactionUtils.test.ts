import {
  adjustEscrow,
  allMilestonesResolved,
  allocateMilestoneStakes,
  computeCompletionPercentage,
  computeStars,
  creditStars,
  escrowStake,
  forfeitStake,
  InsufficientBalanceError,
  releaseStake,
  remainingEscrowedStake,
  settleGoalLoss,
  settleGoalWin,
  settleMilestoneLoss,
  settleMilestoneWin,
  updateGoalStatus,
  writeTransaction,
} from '../../src/common/transactionUtils';
import { GOAL_ID, USER_ID, makeGoal, makeMilestone } from '../fixtures';

// A DocumentClient stand-in: records every call and lets tests make `update` fail.
function makeDb() {
  const update = jest.fn();
  const put = jest.fn();
  const db: any = {
    update: (params: unknown) => ({ promise: () => update(params) }),
    put: (params: unknown) => ({ promise: () => put(params) }),
  };
  update.mockResolvedValue({});
  put.mockResolvedValue({});
  return { db, update, put };
}

const TABLE = 'UserInfo';

describe('pure helpers', () => {
  describe('computeCompletionPercentage', () => {
    it('is 0 for no milestones', () => expect(computeCompletionPercentage([])).toBe(0));
    it('counts only completed milestones', () => {
      expect(computeCompletionPercentage([{ completion: true }, { completion: false }, {}])).toBe(33.3);
    });
    it('is 100 when all completed', () => {
      expect(computeCompletionPercentage([{ completion: true }, { completion: true }])).toBe(100);
    });
  });

  describe('allMilestonesResolved', () => {
    it('is false while any milestone is pending', () => {
      expect(allMilestonesResolved([{ completion: true }, {}])).toBe(false);
    });
    it('is true when every milestone is completed or missed', () => {
      expect(allMilestonesResolved([{ completion: true }, { completion: false }])).toBe(true);
    });
  });

  describe('computeStars', () => {
    it('awards 10% of the stake, rounded down', () => {
      expect(computeStars(50)).toBe(5);
      expect(computeStars(19)).toBe(1);
      expect(computeStars(9)).toBe(0);
    });
  });

  describe('remainingEscrowedStake', () => {
    it('sums the stake of pending milestones only', () => {
      expect(remainingEscrowedStake([
        { stake: 10, completion: true },
        { stake: 20, completion: false },
        { stake: 30 },
        { stake: 40 },
      ])).toBe(70);
    });
  });

  describe('allocateMilestoneStakes', () => {
    it('gives the whole stake to a single implicit milestone', () => {
      expect(allocateMilestoneStakes(100, [])).toEqual([100]);
    });
    it('uses explicit stakes when every milestone has one', () => {
      expect(allocateMilestoneStakes(100, [{ stake: 30 }, { stake: 70 }])).toEqual([30, 70]);
    });
    it('rejects explicit stakes that do not sum to the goal stake', () => {
      expect(() => allocateMilestoneStakes(100, [{ stake: 30 }, { stake: 60 }])).toThrow('must sum exactly');
    });
    it('splits evenly when any stake is missing, with the last milestone taking the rounding', () => {
      expect(allocateMilestoneStakes(100, [{}, {}, {}])).toEqual([33.33, 33.33, 33.34]);
    });
    it('always sums back to the goal stake', () => {
      const stakes = allocateMilestoneStakes(10, [{}, {}, {}, {}, {}, {}, {}]);
      expect(stakes.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 9);
    });
  });
});

describe('balance movements', () => {
  it('escrowStake moves balance into pendingBalance, conditionally', async () => {
    const { db, update } = makeDb();
    await escrowStake(db, TABLE, USER_ID, 25);
    const params = update.mock.calls[0][0];
    expect(params.Key).toEqual({ userId: USER_ID });
    expect(params.ConditionExpression).toContain('balance >= :amount');
    expect(params.ExpressionAttributeValues[':amount']).toBe(25);
  });

  it('escrowStake throws InsufficientBalanceError when the condition fails', async () => {
    const { db, update } = makeDb();
    update.mockRejectedValueOnce(Object.assign(new Error('fail'), { code: 'ConditionalCheckFailedException' }));
    await expect(escrowStake(db, TABLE, USER_ID, 999)).rejects.toBeInstanceOf(InsufficientBalanceError);
  });

  it('escrowStake rethrows other errors unchanged', async () => {
    const { db, update } = makeDb();
    update.mockRejectedValueOnce(new Error('throttled'));
    await expect(escrowStake(db, TABLE, USER_ID, 5)).rejects.toThrow('throttled');
  });

  it('releaseStake returns pendingBalance to balance and requires enough pending', async () => {
    const { db, update } = makeDb();
    await releaseStake(db, TABLE, USER_ID, 10);
    expect(update.mock.calls[0][0].ConditionExpression).toContain('pendingBalance >= :amount');
  });

  it('forfeitStake only reduces pendingBalance', async () => {
    const { db, update } = makeDb();
    await forfeitStake(db, TABLE, USER_ID, 10);
    expect(update.mock.calls[0][0].UpdateExpression).toBe('SET pendingBalance = pendingBalance - :amount');
  });

  it.each([
    ['releaseStake', releaseStake],
    ['forfeitStake', forfeitStake],
    ['creditStars', creditStars],
  ])('%s is a no-op for zero amounts', async (_name, fn) => {
    const { db, update } = makeDb();
    await (fn as any)(db, TABLE, USER_ID, 0);
    expect(update).not.toHaveBeenCalled();
  });

  it('adjustEscrow escrows a positive delta and releases a negative one', async () => {
    const { db, update } = makeDb();
    await adjustEscrow(db, TABLE, USER_ID, 20);
    await adjustEscrow(db, TABLE, USER_ID, -5);
    await adjustEscrow(db, TABLE, USER_ID, 0);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0].ConditionExpression).toContain('balance >= :amount');
    expect(update.mock.calls[1][0].ConditionExpression).toContain('pendingBalance >= :amount');
    expect(update.mock.calls[1][0].ExpressionAttributeValues[':amount']).toBe(5);
  });
});

describe('settlement', () => {
  it('a milestone win refunds the stake and credits 10% stars', async () => {
    const { db, update } = makeDb();
    const entries = await settleMilestoneWin(db, TABLE, USER_ID, 50);
    expect(entries).toEqual([
      expect.objectContaining({ type: 'refund', amount: 50 }),
      expect.objectContaining({ type: 'stars', amount: 5 }),
    ]);
    expect(update).toHaveBeenCalledTimes(2); // release + stars
  });

  it('a small win (under $10) refunds without a stars entry', async () => {
    const { db } = makeDb();
    const entries = await settleMilestoneWin(db, TABLE, USER_ID, 5);
    expect(entries.map(e => e.type)).toEqual(['refund']);
  });

  it('a goal win refunds the whole stake', async () => {
    const { db } = makeDb();
    const entries = await settleGoalWin(db, TABLE, USER_ID, 100);
    expect(entries[0]).toEqual(expect.objectContaining({ type: 'refund', amount: 100, reason: expect.stringContaining('Goal completed') }));
    expect(entries[1]).toEqual(expect.objectContaining({ type: 'stars', amount: 10 }));
  });

  it('losses forfeit the stake', async () => {
    const { db } = makeDb();
    expect(await settleMilestoneLoss(db, TABLE, USER_ID, 30)).toEqual([expect.objectContaining({ type: 'forfeit', amount: 30 })]);
    expect(await settleGoalLoss(db, TABLE, USER_ID, 100)).toEqual([expect.objectContaining({ type: 'forfeit', amount: 100 })]);
  });
});

describe('records', () => {
  it('writeTransaction stores a summary and a goal snapshot', async () => {
    const { db, put } = makeDb();
    const goal = makeGoal({
      milestones: [makeMilestone('a', 'A', 50, true), makeMilestone('b', 'B', 50, false)],
    });
    await writeTransaction(db, 'Transactions', goal, [{ type: 'refund', amount: 50, reason: 'r' }], 'mixed');
    const item = put.mock.calls[0][0].Item;
    expect(item).toEqual(expect.objectContaining({
      goalId: GOAL_ID,
      userId: USER_ID,
      outcome: 'mixed',
      milestonesSummary: { total: 2, completed: 1, missed: 1 },
      goalSnapshot: { goalName: 'Test Goal', allOrNothing: false, stake: 100 },
    }));
    expect(item.transactionId).toEqual(expect.any(String));
  });

  it('updateGoalStatus sets status and updatedAt', async () => {
    const { db, update } = makeDb();
    await updateGoalStatus(db, 'Goals', GOAL_ID, 'completed' as any);
    expect(update.mock.calls[0][0].ExpressionAttributeValues[':status']).toBe('completed');
  });
});
