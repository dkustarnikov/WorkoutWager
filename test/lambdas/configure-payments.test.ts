import { handler } from '../../src/lambdas/configure-payments';
import { context } from '../mockContext';
import { getMockEvent } from '../testHelper';

const mockGet = jest.fn();
const mockUpdate = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      get: (params: unknown) => ({ promise: () => mockGet(params) }),
      update: (params: unknown) => ({ promise: () => mockUpdate(params) }),
    })),
  },
}));

import { USER_ID, makeUser } from '../fixtures';

const paymentsEvent = (body: unknown) => {
  const event = getMockEvent();
  event.body = JSON.stringify(body);
  return event;
};

describe('POST /configure-payments (configure-payments)', () => {
  const ctx = context();

  beforeEach(() => {
    mockUpdate.mockResolvedValue({});
  });

  it('returns 401 without a caller identity', async () => {
    const event = paymentsEvent({ playMoney: true });
    event.requestContext.authorizer = {};
    const result = await handler(event, ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when playMoney is missing', async () => {
    const result = await handler(paymentsEvent({}), ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the caller has no profile yet', async () => {
    mockGet.mockResolvedValueOnce({});
    const result = await handler(paymentsEvent({ playMoney: false }), ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(404);
  });

  it("updates only the caller's own profile, with a stub provider by default", async () => {
    mockGet.mockResolvedValueOnce({ Item: makeUser({ balance: 40, pendingBalance: 10, stars: 2 }) });

    const result = await handler(paymentsEvent({ playMoney: false, userId: 'someone-else' }), ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    const params = mockUpdate.mock.calls[0][0];
    expect(params.Key).toEqual({ userId: USER_ID });
    expect(params.ExpressionAttributeValues[':playMoney']).toBe(false);
    expect(params.ExpressionAttributeValues[':paymentConfig'].provider).toBe('stub');
    expect(JSON.parse(result.body)).toEqual(expect.objectContaining({ playMoney: false, balance: 40, pendingBalance: 10, stars: 2 }));
  });
});
