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

const mockAllMilestonesResolved = jest.fn();
const mockBuildTransactionEntries = jest.fn();
const mockWriteTransaction = jest.fn();
const mockUpdateGoalStatus = jest.fn();
const mockComputeCompletionPercentage = jest.fn();

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

jest.mock('../../src/common/transactionUtils', () => ({
  allMilestonesResolved: mockAllMilestonesResolved,
  buildTransactionEntries: mockBuildTransactionEntries,
  writeTransaction: mockWriteTransaction,
  updateGoalStatus: mockUpdateGoalStatus,
  computeCompletionPercentage: mockComputeCompletionPercentage,
}));

import { handler } from '../../src/lambdas/complete-milestone';
import { GoalStatus } from '../../src/common/models';
import { GOAL_ID, MS_ID_1, MS_ID_2, makeGoal, makeMilestone } from '../fixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /goal/{goalId}/milestone/{milestoneId}/complete (complete-milestone)', () => {
  let ctx: any;

  beforeAll(() => {
    ctx = context();
  });

  beforeEach(() => {
    mockDynamoPut.mockResolvedValue({});
    mockEventBridgeRemoveTargets.mockResolvedValue({});
    mockEventBridgeDeleteRule.mockResolvedValue({});
    mockWriteTransaction.mockResolvedValue(undefined);
    mockUpdateGoalStatus.mockResolvedValue(undefined);
    mockComputeCompletionPercentage.mockReturnValue(50);
    mockAllMilestonesResolved.mockReturnValue(false);
    mockBuildTransactionEntries.mockReturnValue({ entries: [], outcome: 'reward' });
  });

  it('returns 400 when goalId or milestoneId path parameters are missing', async () => {
    const event = getMockEvent();
    event.pathParameters = null;

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when the goal does not exist', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: undefined });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when the goal is already resolved', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true)], status: GoalStatus.completed }),
    });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/resolved/i);
  });

  it('returns 404 when the milestone is not found in the goal', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50)] }),
    });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: 'ms-nonexistent' };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(404);
  });

  it('returns 200 with idempotent message when milestone is already completed', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, true)] }),
    });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toMatch(/already completed/i);
  });

  it('returns 400 when the milestone was already missed', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, false)] }),
    });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/missed/i);
  });

  it('marks milestone as completed and saves when other milestones are still pending', async () => {
    const milestones = [makeMilestone(MS_ID_1, 'Week 1', 50), makeMilestone(MS_ID_2, 'Week 2', 50)];
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones }) });
    mockAllMilestonesResolved.mockReturnValueOnce(false);

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    // Goal saved but no transaction written
    expect(mockDynamoPut).toHaveBeenCalled();
    expect(mockWriteTransaction).not.toHaveBeenCalled();
    expect(mockUpdateGoalStatus).not.toHaveBeenCalled();
  });

  it('cancels the EventBridge rule for the completed milestone', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50)] }),
    });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    await handler(event, ctx, jest.fn());

    expect(mockEventBridgeRemoveTargets).toHaveBeenCalledTimes(1);
    expect(mockEventBridgeDeleteRule).toHaveBeenCalledTimes(1);
  });

  it('writes a transaction and resolves the goal when the last milestone is completed', async () => {
    const milestones = [makeMilestone(MS_ID_1, 'Week 1', 50)];
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ milestones }) });
    mockAllMilestonesResolved.mockReturnValueOnce(true);
    mockBuildTransactionEntries.mockReturnValueOnce({ entries: [{ type: 'reward', amount: 100 }], outcome: 'reward' });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(mockWriteTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdateGoalStatus).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.body);
    expect(body.outcome).toBe('reward');
  });

  it('sets goal status to failed when outcome is penalty at final resolution', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50)] }),
    });
    mockAllMilestonesResolved.mockReturnValueOnce(true);
    mockBuildTransactionEntries.mockReturnValueOnce({ entries: [], outcome: 'penalty' });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    await handler(event, ctx, jest.fn());

    const [, , , finalStatus] = mockUpdateGoalStatus.mock.calls[0];
    expect(finalStatus).toBe('failed');
  });

  it('sets goal status to completed when outcome is reward at final resolution', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50)] }),
    });
    mockAllMilestonesResolved.mockReturnValueOnce(true);
    mockBuildTransactionEntries.mockReturnValueOnce({ entries: [], outcome: 'reward' });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    await handler(event, ctx, jest.fn());

    const [, , , finalStatus] = mockUpdateGoalStatus.mock.calls[0];
    expect(finalStatus).toBe('completed');
  });

  it('includes completionPercentage in the response', async () => {
    mockDynamoGet.mockResolvedValueOnce({
      Item: makeGoal({ milestones: [makeMilestone(MS_ID_1, 'Week 1', 50), makeMilestone(MS_ID_2, 'Week 2', 50)] }),
    });
    mockComputeCompletionPercentage.mockReturnValueOnce(50);

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).completionPercentage).toBe(50);
  });

  it('returns 500 when DynamoDB throws an error', async () => {
    mockDynamoGet.mockRejectedValueOnce(new Error('Read error'));

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
