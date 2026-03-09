/**
 * Shared test fixtures for WorkoutWager unit tests.
 *
 * All test data lives here so that schema changes only need to be made in one place.
 * Import what you need in each test file:
 *
 *   import { GOAL_ID, MS_1, makeGoal, makeMilestone, makeSQSEvent } from '../fixtures';
 */

import { SQSEvent, SQSRecord } from 'aws-lambda';
import { Goal, GoalStatus, Milestone } from '../src/common/models';

// ---------------------------------------------------------------------------
// Stable IDs & dates used throughout
// ---------------------------------------------------------------------------

export const GOAL_ID = 'goal-123';
export const USER_ID = 'user-456';

/** Far-future date used as the goal deadline in most tests. */
export const GOAL_DEADLINE = '2099-12-31T23:59:59.000Z';

/** A mid-point date used for the first of two milestones. */
export const MID_DEADLINE = '2099-06-30T23:59:59.000Z';

/** An early date used when a milestone needs a deadline before MID_DEADLINE. */
export const EARLY_DEADLINE = '2099-06-01T00:00:00.000Z';

export const MS_ID_1 = 'ms-1';
export const MS_ID_2 = 'ms-2';
export const MS_ID_3 = 'ms-3';

// ---------------------------------------------------------------------------
// Milestone factory
//
//   makeMilestone('ms-1', 'Week 1', 50)            → pending  (no completion)
//   makeMilestone('ms-1', 'Week 1', 50, true)       → completed
//   makeMilestone('ms-1', 'Week 1', 50, false)      → missed
//
// The deadline defaults to EARLY_DEADLINE; pass a custom value when needed.
// ---------------------------------------------------------------------------

export const makeMilestone = (
  id: string,
  name: string,
  monetaryValue: number,
  completion?: boolean,
  milestoneDeadline: string = EARLY_DEADLINE,
): Milestone => ({
  milestoneId: id,
  milestoneName: name,
  type: 'common',
  milestoneCounter: 1,
  milestoneDeadline,
  monetaryValue,
  ...(completion !== undefined ? { completion } : {}),
});

/** Standard two-milestone set: ms-1 at MID_DEADLINE ($50), ms-2 at GOAL_DEADLINE ($50). */
export const defaultMilestones: Milestone[] = [
  makeMilestone(MS_ID_1, 'Week 1', 50, undefined, MID_DEADLINE),
  makeMilestone(MS_ID_2, 'Week 2', 50, undefined, GOAL_DEADLINE),
];

// ---------------------------------------------------------------------------
// Goal factory
//
//   makeGoal()                          → default in-progress goal
//   makeGoal({ status: 'completed' })   → completed goal
//   makeGoal({ allOrNothing: true })    → all-or-nothing mode
//   makeGoal({ milestones: [...] })     → custom milestones
// ---------------------------------------------------------------------------

export const makeGoal = (overrides: Partial<Goal> = {}): Goal => ({
  goalId: GOAL_ID,
  userId: USER_ID,
  goalType: 'fitness',
  goalName: 'Test Goal',
  generalObjective: 'Get fit',
  totalAmount: 100,
  deadline: GOAL_DEADLINE,
  milestones: defaultMilestones,
  allOrNothing: false,
  rewardDestination: 'savings',
  penaltyDestination: 'charity',
  penaltyInterestRate: 20,
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  status: GoalStatus.inProgress,
  ...overrides,
});

// ---------------------------------------------------------------------------
// SQS event factory (used by milestone-handler tests)
// ---------------------------------------------------------------------------

export const makeSQSEvent = (body: object): SQSEvent => ({
  Records: [
    {
      messageId: 'msg-1',
      receiptHandle: 'handle-1',
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '0',
        SenderId: 'sender',
        ApproximateFirstReceiveTimestamp: '0',
      },
      messageAttributes: {},
      md5OfBody: 'md5',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:MilestoneQueue',
      awsRegion: 'us-east-1',
    } as SQSRecord,
  ],
});

// ---------------------------------------------------------------------------
// Shared valid request body for create-goal / update-goal tests
// ---------------------------------------------------------------------------

export const validGoalBody = {
  userId: USER_ID,
  goalType: 'fitness',
  goalName: 'Test Goal',
  generalObjective: 'Get fit',
  totalAmount: 100,
  deadline: GOAL_DEADLINE,
  milestones: [
    {
      milestoneId: MS_ID_1,
      milestoneName: 'Week 1',
      type: 'common',
      milestoneDeadline: MID_DEADLINE,
      monetaryValue: 50,
    },
    {
      milestoneId: MS_ID_2,
      milestoneName: 'Week 2',
      type: 'common',
      milestoneDeadline: GOAL_DEADLINE,
      monetaryValue: 50,
    },
  ],
  allOrNothing: false,
  rewardDestination: 'savings',
  penaltyDestination: 'charity',
  penaltyInterestRate: 20,
};

// ---------------------------------------------------------------------------
// Shared valid milestone body for add-milestone / update-milestone tests
// ---------------------------------------------------------------------------

export const validMilestoneBody = {
  milestoneName: 'Week 0',
  type: 'common',
  milestoneDeadline: EARLY_DEADLINE,
  monetaryValue: 25,
};
