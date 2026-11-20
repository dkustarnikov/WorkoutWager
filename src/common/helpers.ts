import * as yup from 'yup';

export function getApiResponse(statusCode: number, body: string) {
  return {
    statusCode,
    body,
    headers: {
      'Content-Type': 'application/json',
      // Browsers always send a preflight first (every route needs Authorization), and API
      // Gateway's OPTIONS response is what enforces the origin allowlist. The actual response
      // still needs this header or the browser discards it. Non-browser clients ignore it.
      'Access-Control-Allow-Origin': '*',
    },
  };
}

const ISO_8601_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export const milestoneSchema = yup.object().shape({
  milestoneName: yup.string().required('Milestone name is required'),
  type: yup.string().required('Milestone type is required'),
  // Accepted for compatibility but ignored: completion is set by the server only.
  completion: yup.boolean().notRequired(),
  milestoneDeadline: yup.string().required('Milestone deadline is required').matches(
    ISO_8601_UTC,
    'Milestone deadline must be a valid ISO 8601 date string',
  ),
  // Optional: if any milestone omits it, the goal stake is split evenly.
  stake: yup.number().positive('Milestone stake must be positive').notRequired(),
});

export const goalSchema = yup.object().shape({
  // Ignored if sent: the owner is always the authenticated caller.
  userId: yup.string().notRequired(),
  goalType: yup.string().required('Goal type is required'),
  goalName: yup.string().required('Goal name is required'),
  generalObjective: yup.string().required('General objective is required'),
  deadline: yup.string().required('Deadline is required').matches(
    ISO_8601_UTC,
    'Deadline must be a valid ISO 8601 date string',
  ),
  milestones: yup.array().of(milestoneSchema).required('Milestones are required'),
  allOrNothing: yup.boolean().default(false),
  stake: yup.number().required('Stake is required').positive('Stake must be positive'),
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