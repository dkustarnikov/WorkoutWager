import context from 'aws-lambda-mock-context';
import * as yup from 'yup';
// @ts-ignore
import { handler } from '../../src/lambdas/update-rule';
import { getMockEvent } from '../testHelper';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDynamoGet = jest.fn();
const mockDynamoPut = jest.fn();
const mockEventBridgePutRule = jest.fn();
const mockEventBridgePutTargets = jest.fn();
const mockGoalSchemaValidate = jest.fn();

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
  goalSchema: { validate: mockGoalSchemaValidate },
  convertToCronExpression: jest.fn().mockReturnValue('0 0 31 12 *'),
}));

jest.mock('../../src/common/transactionUtils', () => ({
  computeCompletionPercentage: jest.fn().mockReturnValue(0),
}));


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import { GoalStatus } from '../../src/common/models';
import { GOAL_ID, GOAL_DEADLINE, makeGoal, validGoalBody } from '../fixtures';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// describe('PUT /goal/{goalId} (update-goal)', () => {
//   let ctx :any;

  // beforeAll(() => {
  //   ctx = context();
  // });

  // beforeEach(() => {
  //   mockGoalSchemaValidate.mockResolvedValue(true);
  //   mockDynamoGet.mockResolvedValue({ Item: makeGoal() });
  //   mockDynamoPut.mockResolvedValue({});
  //   mockEventBridgePutRule.mockResolvedValue({});
  //   mockEventBridgePutTargets.mockResolvedValue({});
  // });

  // it('returns 400 when goalId path parameter is missing', async () => {
  //   const event = getMockEvent();
  //   event.pathParameters = null;
  //   event.body = JSON.stringify(validGoalBody);

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(400);
  // });

  // it('returns 400 when schema validation fails', async () => {
  //   const validationError = new yup.ValidationError('goalName is required', null, 'goalName');
  //   mockGoalSchemaValidate.mockRejectedValueOnce(validationError);

  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify({});

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(400);
  // });

  // it('returns 400 when the deadline is in the past', async () => {
  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify({
  //     ...validGoalBody,
  //     deadline: '2000-01-01T00:00:00.000Z',
  //     milestones: [{ ...validGoalBody.milestones[0], milestoneDeadline: '2000-01-01T00:00:00.000Z' }],
  //   });

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(400);
  // });

  // it('returns 400 when milestone monetary values do not sum to totalAmount', async () => {
  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify({ ...validGoalBody, totalAmount: 999 });

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(400);
  // });

  // it('returns 404 when the goal does not exist', async () => {
  //   mockDynamoGet.mockResolvedValueOnce({ Item: undefined });

  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify(validGoalBody);

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(404);
  // });

  // it('returns 400 when the goal is already completed', async () => {
  //   mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status: GoalStatus.completed }) });

  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify(validGoalBody);

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(400);
  //   expect(JSON.parse(result.body).message).toMatch(/resolved/i);
  // });

  // it('returns 400 when the goal has already failed', async () => {
  //   mockDynamoGet.mockResolvedValueOnce({ Item: makeGoal({ status: GoalStatus.failed }) });

  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify(validGoalBody);

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(400);
  // });

  // it('returns 200 and updates the goal successfully', async () => {
  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify({ ...validGoalBody, goalName: 'New Name' });

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(200);
  //   const body = JSON.parse(result.body);
  //   expect(body.goalName).toBe('New Name');
  //   expect(body.completionPercentage).toBeDefined();
  // });

  // it('re-schedules EventBridge rules for each milestone on update', async () => {
  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify(validGoalBody);

  //   await handler(event, ctx, jest.fn());

  //   // 2 milestones → putRule and putTargets called once per milestone
  //   expect(mockEventBridgePutRule).toHaveBeenCalledTimes(2);
  //   expect(mockEventBridgePutTargets).toHaveBeenCalledTimes(2);
  // });

  // it('returns 500 on DynamoDB error', async () => {
  //   mockDynamoPut.mockRejectedValueOnce(new Error('Timeout'));

  //   const event = getMockEvent();
  //   event.pathParameters = { goalId: GOAL_ID };
  //   event.body = JSON.stringify(validGoalBody);

  //   const result = await handler(event, ctx, jest.fn()) as any;

  //   expect(result.statusCode).toBe(500);
  // });
// });
