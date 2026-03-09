import context from 'aws-lambda-mock-context';
import * as yup from 'yup';
// @ts-ignore
import { handler } from '../../src/lambdas/add-milestone';
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDynamoGet = jest.fn();
const mockDynamoPut = jest.fn();
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
import { GOAL_ID, GOAL_DEADLINE, MS_ID_1, makeGoal, makeMilestone, validMilestoneBody } from '../fixtures';

// A single-milestone goal (ms-1 at GOAL_DEADLINE) — new milestone will be added to it
const baseGoal = makeGoal({
  milestones: [makeMilestone(MS_ID_1, 'Week 1', 50, undefined, GOAL_DEADLINE)],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /goal/{goalId}/milestone (add-milestone)', () => {
  let ctx: any;

  beforeAll(() => {
    ctx = context();
  });

  beforeEach(() => {
    mockMilestoneSchemaValidate.mockResolvedValue(true);
    mockDynamoGet.mockResolvedValue({ Item: JSON.parse(JSON.stringify(baseGoal)) });
    mockDynamoPut.mockResolvedValue({});
    mockEventBridgePutRule.mockResolvedValue({});
    mockEventBridgePutTargets.mockResolvedValue({});
  });

  it('returns 400 when goalId path parameter is missing', async () => {
    const event = getMockEvent();
    event.pathParameters = null;
    event.body = JSON.stringify({ milestone: validMilestoneBody });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when no milestone is provided in the request body', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({});

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/missing milestone/i);
  });

  it('returns 400 when milestone schema validation fails', async () => {
    const validationError = new yup.ValidationError('milestoneName is required', null, 'milestoneName');
    mockMilestoneSchemaValidate.mockRejectedValueOnce(validationError);

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({ milestone: {} });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 404 when the goal does not exist', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: undefined });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({ milestone: validMilestoneBody });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when the goal is already completed', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status: GoalStatus.completed }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({ milestone: validMilestoneBody });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/resolved/i);
  });

  it('returns 400 when the goal has already failed', async () => {
    mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status: GoalStatus.failed }) });

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({ milestone: validMilestoneBody });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when milestone deadline is past the goal deadline', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({
      milestone: { ...validMilestoneBody, milestoneDeadline: '2150-01-01T00:00:00.000Z' },
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/deadline/i);
  });

  it('returns 400 when a milestone with the same deadline already exists', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({
      milestone: { ...validMilestoneBody, milestoneDeadline: GOAL_DEADLINE }, // duplicate
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/unique/i);
  });

  it('returns 400 when a milestone with the same name already exists', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({
      milestone: { ...validMilestoneBody, milestoneName: 'Week 1' }, // duplicate name
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/unique/i);
  });

  it('returns 200 and adds the milestone with no completion set (pending)', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({ milestone: validMilestoneBody });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.milestones).toHaveLength(2);

    const addedMilestone = body.milestones.find((m: any) => m.milestoneName === 'Week 0');
    expect(addedMilestone).toBeDefined();
    expect(addedMilestone.completion).toBeUndefined();
  });

  it('schedules an EventBridge rule for the new milestone', async () => {
    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({ milestone: validMilestoneBody });

    await handler(event, ctx, jest.fn());

    expect(mockEventBridgePutRule).toHaveBeenCalledTimes(1);
    expect(mockEventBridgePutTargets).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when DynamoDB throws an error', async () => {
    mockDynamoPut.mockRejectedValueOnce(new Error('Write failed'));

    const event = getMockEvent();
    event.pathParameters = { goalId: GOAL_ID };
    event.body = JSON.stringify({ milestone: validMilestoneBody });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
