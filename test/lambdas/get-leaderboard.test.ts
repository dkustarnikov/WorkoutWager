import { handler, publicName } from '../../src/lambdas/get-leaderboard';
import { context } from '../mockContext';
import { getMockEvent } from '../testHelper';

const mockScan = jest.fn();

jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      scan: (params: unknown) => ({ promise: () => mockScan(params) }),
    })),
  },
}));

import { makeUser } from '../fixtures';

describe('GET /leaderboard (get-leaderboard)', () => {
  const ctx = context();

  it('ranks users by stars, highest first', async () => {
    mockScan.mockResolvedValueOnce({
      Items: [
        makeUser({ userId: 'a', username: 'alice', stars: 3 }),
        makeUser({ userId: 'b', username: 'bob', stars: 10 }),
        makeUser({ userId: 'c', username: 'cara', stars: 7 }),
      ],
    });

    const result = await handler(getMockEvent(), ctx, jest.fn()) as any;

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).map((e: any) => e.userId)).toEqual(['b', 'c', 'a']);
  });

  it('never exposes email addresses', async () => {
    mockScan.mockResolvedValueOnce({ Items: [makeUser({ username: 'runner@example.com', email: 'runner@example.com' })] });

    const result = await handler(getMockEvent(), ctx, jest.fn()) as any;

    expect(result.body).not.toContain('@');
    expect(JSON.parse(result.body)[0]).not.toHaveProperty('email');
  });

  it('defaults missing economy fields to 0 (profiles from before play money)', async () => {
    mockScan.mockResolvedValueOnce({ Items: [{ userId: 'old', username: 'old' }] });

    const result = await handler(getMockEvent(), ctx, jest.fn()) as any;

    expect(JSON.parse(result.body)[0]).toEqual({ userId: 'old', username: 'old', stars: 0, balance: 0, pendingBalance: 0 });
  });

  it('reads every page of the table', async () => {
    mockScan
      .mockResolvedValueOnce({ Items: [makeUser({ userId: 'p1' })], LastEvaluatedKey: { userId: 'p1' } })
      .mockResolvedValueOnce({ Items: [makeUser({ userId: 'p2' })] });

    const result = await handler(getMockEvent(), ctx, jest.fn()) as any;

    expect(mockScan).toHaveBeenCalledTimes(2);
    expect(mockScan.mock.calls[1][0].ExclusiveStartKey).toEqual({ userId: 'p1' });
    expect(JSON.parse(result.body)).toHaveLength(2);
  });

  it('returns 500 on DynamoDB errors', async () => {
    mockScan.mockRejectedValueOnce(new Error('boom'));
    const result = await handler(getMockEvent(), ctx, jest.fn()) as any;
    expect(result.statusCode).toBe(500);
  });

  describe('publicName', () => {
    it.each([
      ['runner@example.com', 'runn•••'],
      ['ab@x.io', 'a•••'],
      ['marathoner', 'marathoner'],
      [undefined, 'anonymous'],
    ])('%s → %s', (input, expected) => {
      expect(publicName(input as any)).toBe(expected);
    });
  });
});
