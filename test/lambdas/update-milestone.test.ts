import context from 'aws-lambda-mock-context';
import * as yup from 'yup';
// @ts-ignore
import { handler } from '../../src/lambdas/update-milestone';
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDynamoGet = jest.fn();
const mockDynamoPut = jest.fn();
const mockEventBridgeRemoveTargets = jest.fn();
const mockEventBridgeDeleteRule = jest.fn();
const mockEventBridgePutRule = jest.fn();
const mockEventBridgePutTargets = jest.fn();
const mockMilestoneSchemaValidate = jest.fn();

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
    putRule: () => ({ promise: mockEventBridgePutRule }),
    putTargets: () => ({ promise: mockEventBridgePutTargets }),
  })),
}));

jest.mock('../../src/common/helpers', () => ({
  getApiResponse: jest.fn((statusCode: number, body: string) => ({ statusCode, body })),
  milestoneSchema: { validate: mockMilestoneSchemaValidate },
  convertToCronExpression: jest.fn().mockReturnValue('0 0 31 12 *'),
}));


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import { GoalStatus } from '../../src/common/models';
import { GOAL_ID, GOAL_DEADLINE, EARLY_DEADLINE, MS_ID_1, MS_ID_2, makeGoal, makeMilestone } from '../fixtures';

/** A date between EARLY_DEADLINE and GOAL_DEADLINE, unique to this test. */
const NEW_DEADLINE = '2099-09-01T00:00:00.000Z';

// ms-1 uses EARLY_DEADLINE so we can test "deadline unchanged" vs "deadline changed" logic
const baseGoal = makeGoal({
  milestones: [
    makeMilestone(MS_ID_1, 'Week 1', 50, undefined, EARLY_DEADLINE),
    makeMilestone(MS_ID_2, 'Week 2', 50, undefined, GOAL_DEADLINE),
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PUT /goal/{goalId}/milestone/{milestoneId} (update-milestone)', () => {
  let ctx: any;

  beforeAll(() => {
    ctx = context();
  });

  beforeEach(() => {
    mockMilestoneSchemaValidate.mockResolvedValue(true);
    mockDynamoGet.mockResolvedValue({ Item: JSON.parse(JSON.stringify(baseGoal)) });
    mockDynamoPut.mockResolvedValue({});
    mockEventBridgeRemoveTargets.mockResolvedValue({});
    mockEventBridgeDeleteRule.mockResolvedValue({});
    mockEventBridgePutRule.mockResolvedValue({});
    mockEventBridgePutTargets.mockResolvedValue({});
  });

  it('returns 400 when goalId or milestoneId path parameters are missing', async () => {
    const event = getMockEvent();
    event.pathParameters = null;
    event.body = JSON.stringify({ milestone: {} });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when no milestone data is provided', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({});

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/required/i);
  });

  it('returns 400 when milestone schema validation fails', async () => {
    const validationError = new yup.ValidationError('type is required', null, 'type');
    mockMilestoneSchemaValidate.mockRejectedValueOnce(validationError);

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({ milestone: { milestoneName: 'New' } });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when the goal does not exist', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: undefined });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({ milestone: { milestoneName: 'New', type: 'common', milestoneDeadline: EARLY_DEADLINE, monetaryValue: 50 } });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when the goal is already resolved', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status: GoalStatus.completed }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({ milestone: { milestoneName: 'New', type: 'common', milestoneDeadline: EARLY_DEADLINE, monetaryValue: 50 } });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/resolved/i);
  });

  it('returns 404 when the milestone is not found in the goal', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: 'ms-nonexistent' };
    event.body = JSON.stringify({ milestone: { milestoneName: 'New', type: 'common', milestoneDeadline: EARLY_DEADLINE, monetaryValue: 50 } });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toMatch(/not found/i);
  });

  it('returns 400 when updated deadline is past the goal deadline', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({
      milestone: { milestoneName: 'Week 1', type: 'common', milestoneDeadline: '2150-01-01T00:00:00.000Z', monetaryValue: 50 },
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/deadline/i);
  });

  it('returns 400 when the new deadline clashes with another milestone', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({
      milestone: { milestoneName: 'Week 1', type: 'common', milestoneDeadline: GOAL_DEADLINE, monetaryValue: 50 }, // clashes with ms-2
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/unique/i);
  });

  it('returns 200 and updates the milestone when deadline is unchanged', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({
      milestone: { milestoneName: 'Week 1 Renamed', type: 'common', milestoneDeadline: EARLY_DEADLINE, monetaryValue: 50 },
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    // Deadline unchanged → no EventBridge rule recreation
    expect(mockEventBridgePutRule).not.toHaveBeenCalled();
  });

  it('returns 200 and recreates EventBridge rule when deadline changes', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({
      milestone: { milestoneName: 'Week 1', type: 'common', milestoneDeadline: NEW_DEADLINE, monetaryValue: 50 },
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(mockEventBridgeRemoveTargets).toHaveBeenCalledTimes(1);
    expect(mockEventBridgeDeleteRule).toHaveBeenCalledTimes(1);
    expect(mockEventBridgePutRule).toHaveBeenCalledTimes(1);
    expect(mockEventBridgePutTargets).toHaveBeenCalledTimes(1);
  });

  it('preserves the original completion state when updating milestone metadata', async () => {
    const goalWithCompletedMs = makeGoal({
      milestones: [
        makeMilestone(MS_ID_1, 'Week 1', 50, true, EARLY_DEADLINE),
        makeMilestone(MS_ID_2, 'Week 2', 50, undefined, GOAL_DEADLINE),
      ],
    });
    mockDynamoGet.mockResolvedValueOnce({ Item: goalWithCompletedMs });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({
      milestone: { milestoneName: 'Week 1 Renamed', type: 'common', milestoneDeadline: EARLY_DEADLINE, monetaryValue: 50 },
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    const savedGoal = JSON.parse(mockDynamoPut.mock.calls[0][0].Item
      ? JSON.stringify(mockDynamoPut.mock.calls[0][0].Item)
      : '{}');
    const ms1 = savedGoal.milestones?.find((m: any) => m.milestoneId === MS_ID_1);
    expect(ms1?.completion).toBe(true);
  });

  it('returns 500 when DynamoDB throws an error', async () => {
    mockDynamoPut.mockRejectedValueOnce(new Error('Write failed'));

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID, milestoneId: MS_ID_1 };
    event.body = JSON.stringify({
      milestone: { milestoneName: 'Week 1', type: 'common', milestoneDeadline: EARLY_DEADLINE, monetaryValue: 50 },
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
