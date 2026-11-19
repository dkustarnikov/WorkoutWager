import * as yup from 'yup';

export function getApiResponse(statusCode: number, body: string) {
  return {
    statusCode,
    body,
    headers: {
      'Content-Type': 'application/json',
    },
  };
}

export const milestoneSchema = yup.object().shape({
  milestoneName: yup.string().required('Milestone name is required'),
  type: yup.string().required('Milestone type is required'),
  // Optional: completion is set by the server, never trusted from clients.
  completion: yup.boolean().optional(),
  milestoneDeadline: yup.string().required('Milestone deadline is required').matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
    'Milestone deadline must be a valid ISO 8601 date string',
  ),
  monetaryValue: yup.number().required('Milestone monetary value is required').positive('Monetary value must be positive'),
});

export const goalSchema = yup.object().shape({
  userId: yup.string().required('User ID is required'),
  goalType: yup.string().required('Goal type is required'),
  goalName: yup.string().required('Goal name is required'),
  generalObjective: yup.string().required('General objective is required'),
  totalAmount: yup.number().required('Total amount is required').positive('Total amount must be positive'),
  deadline: yup.string().required('Deadline is required').matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/,
    'Deadline must be a valid ISO 8601 date string',
  ),
  milestones: yup.array().of(milestoneSchema).required('Milestones are required'),
  allOrNothing: yup.boolean().default(false),
  rewardDestination: yup.string().default('savings'),
  penaltyDestination: yup.string().default('savings'),
  penaltyInterestRate: yup.number().min(0).default(0),
});

export function convertToCronExpression(isoString: string): string {
  const date = new Date(isoString);
  const minutes = date.getUTCMinutes();
  const hours = date.getUTCHours();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth() + 1; // getUTCMonth returns 0-11, so we add 1
  const year = date.getUTCFullYear();

  // Ensure all values are within valid ranges
  if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23 || dayOfMonth < 1 || dayOfMonth > 31 || month < 1 || month > 12) {
    throw new Error('Invalid date for cron expression');
  }

  return `${minutes} ${hours} ${dayOfMonth} ${month} ? ${year}`;
}