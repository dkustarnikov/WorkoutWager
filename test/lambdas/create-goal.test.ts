import context from 'aws-lambda-mock-context';
// @ts-ignore
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDynamoPut = jest.fn();
const mockEventBridgePutRule = jest.fn();
const mockEventBridgePutTargets = jest.fn();
const mockGoalSchemaValidate = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
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
  goalSchema: { validate: mockGoalSchemaValidate },
  convertToCronExpression: jest.fn().mockReturnValue('0 0 31 12 *'),
}));

jest.mock('../../src/common/transactionUtils', () => ({
  computeCompletionPercentage: jest.fn().mockReturnValue(0),
}));

import { handler } from '../../src/lambdas/create-rule';
import { GOAL_DEADLINE, MID_DEADLINE, validGoalBody } from '../fixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /goal (create-goal)', () => {
  let ctx: any;

  beforeAll(() => {
    ctx = context();
  });

  beforeEach(() => {
    mockGoalSchemaValidate.mockResolvedValue(true);
    mockDynamoPut.mockResolvedValue({});
    mockEventBridgePutRule.mockResolvedValue({});
    mockEventBridgePutTargets.mockResolvedValue({});
  });

  it('returns 400 when schema validation fails', async () => {
    const err = Object.assign(new Error('Validation failed'), { errors: ['userId is required'] });
    mockGoalSchemaValidate.mockRejectedValueOnce(err);

    const event = getMockEvent();
    event.body = JSON.stringify({});

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.errors).toContain('userId is required');
  });

  it('returns 400 when the deadline is in the past', async () => {
    const event = getMockEvent();
    event.body = JSON.stringify({
      ...validGoalBody,
      deadline: '2000-01-01T00:00:00.000Z',
      milestones: [{ ...validGoalBody.milestones[1], milestoneDeadline: '2000-01-01T00:00:00.000Z' }],
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/future/i);
  });

  it('returns 400 when milestone monetary values do not sum to totalAmount', async () => {
    const event = getMockEvent();
    event.body = JSON.stringify({
      ...validGoalBody,
      totalAmount: 999, // mismatch
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/monetary value/i);
  });

  it('returns 400 when the last milestone deadline does not match the goal deadline', async () => {
    const event = getMockEvent();
    event.body = JSON.stringify({
      ...validGoalBody,
      milestones: [
        { ...validGoalBody.milestones[0], milestoneDeadline: MID_DEADLINE },
        { ...validGoalBody.milestones[1], milestoneDeadline: MID_DEADLINE }, // wrong — must equal GOAL_DEADLINE
      ],
    });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/last milestone deadline/i);
  });

  it('returns 201 and creates the goal successfully with provided milestones', async () => {
    const event = getMockEvent();
    event.body = JSON.stringify(validGoalBody);

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.goalId).toBeDefined();
    expect(body.goalName).toBe('Test Goal');
    expect(body.milestones).toHaveLength(2);
    expect(body.completionPercentage).toBeDefined();
  });

  it('auto-creates a single default milestone when no milestones are provided', async () => {
    const event = getMockEvent();
    event.body = JSON.stringify({ ...validGoalBody, milestones: [] });

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.milestones).toHaveLength(1);
    expect(body.milestones[0].milestoneDeadline).toBe(GOAL_DEADLINE);
    expect(body.milestones[0].monetaryValue).toBe(100); // equals totalAmount
  });

  it('schedules an EventBridge rule for each milestone', async () => {
    const event = getMockEvent();
    event.body = JSON.stringify(validGoalBody);

    await handler(event, ctx, jest.fn());

    // 2 milestones → putRule and putTargets called once each per milestone
    expect(mockEventBridgePutRule).toHaveBeenCalledTimes(2);
    expect(mockEventBridgePutTargets).toHaveBeenCalledTimes(2);
  });

  it('newly created milestones have no completion set (pending state)', async () => {
    const event = getMockEvent();
    event.body = JSON.stringify(validGoalBody);

    const result = await handler(event, ctx, jest.fn()) as any;

    const body = JSON.parse(result.body);
    body.milestones.forEach((m: any) => {
      expect(m.completion).toBeUndefined();
    });
  });

  it('returns 500 when DynamoDB put throws an error', async () => {
    mockDynamoPut.mockRejectedValueOnce(new Error('Write capacity exceeded'));

    const event = getMockEvent();
    event.body = JSON.stringify(validGoalBody);

    const result = await handler(event, ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(500);
  });
});
