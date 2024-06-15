import context from 'aws-lambda-mock-context';
import { getApiResponse } from '../../src/common/helpers';
import { handler } from '../../src/lambdas/health';
// @ts-ignore
import { getMockEvent } from '../testHelper';

jest.mock('../../src/common/helpers', () => ({
  getApiResponse: jest.fn(),
}));

describe('health-get:', () => {
  let ctx: any;
  let event: any;

  beforeAll(() => {
    process.env.SOME_KEY = 'test-key';
    ctx = context();
    event = getMockEvent();
    event.path = '/health';
  });

  it('should return a 200 and healthy if the service is available', async () => {
    (getApiResponse as jest.Mock).mockReturnValue({
      statusCode: 200,
      body: JSON.stringify({ message: 'Healthy!' }),
    });

    const result = await handler(event, ctx, (error, response) => {
      // Callback function - not used in this test
      console.log(`Error: ${error}, Response: ${response}`);
    });

    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Healthy!' }),
    });
    expect(getApiResponse).toHaveBeenCalledWith(200, JSON.stringify({ message: 'Healthy!' }));
  });
});
