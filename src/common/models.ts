export interface Milestone {
  milestoneId: string;
  milestoneName: string;
  type: string;
  completion?: boolean; // true = completed, false = missed, undefined = pending
  milestoneCounter: number; // order within goal
  milestoneDeadline: string; // ISO 8601 date string
  monetaryValue: number;
}

export interface Goal {
  goalId: string; // Primary Key
  userId: string;
  goalType: string;
  goalName: string;
  generalObjective: string;
  totalAmount: number;
  deadline: string; // ISO 8601 date string
  milestones: Milestone[];
  allOrNothing: boolean; // if true: any miss = full penalty on totalAmount
  rewardDestination: string; // where money goes on success (default: "savings")
  penaltyDestination: string; // where money goes on failure (default: "savings")
  penaltyInterestRate: number; // extra % on top of penalty, e.g. 20 = 20%
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
  status: GoalStatus;
}

export enum GoalStatus {
  created = 'created',
  inProgress = 'inProgress',
  completed = 'completed',
  failed = 'failed',
  cancelled = 'cancelled',
}

export interface TransactionEntry {
  type: 'reward' | 'penalty';
  destination: string;
  amount: number;
  reason: string;
}

export interface Transaction {
  transactionId: string;
  goalId: string;
  userId: string;
  timestamp: string;
  outcome: 'reward' | 'penalty' | 'mixed';
  entries: TransactionEntry[];
  milestonesSummary: {
    total: number;
    completed: number;
    missed: number; // completion === false
  };
  goalSnapshot: {
    goalName: string;
    totalAmount: number;
    allOrNothing: boolean;
    penaltyInterestRate: number;
  };
}

export interface User {
  userId: string;
  username: string;
  email: string;
  goalIds: string[];
}