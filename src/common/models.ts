// Play-money economy settings.
/** Every new user starts with this much play money. */
export const STARTING_BALANCE = 50;
/** New users are in play-money mode until they configure payments. */
export const DEFAULT_PLAY_MONEY = true;
/** Stars earned per dollar of stake won (10%), rounded down. */
export const STARS_RATE = 0.1;

export interface Milestone {
  milestoneId: string;
  milestoneName: string;
  type: string;
  completion?: boolean; // true = completed, false = missed, undefined = pending
  milestoneCounter: number; // 1-based order within the goal (sorted by deadline)
  milestoneDeadline: string; // ISO 8601
  stake: number; // this milestone's share of the goal stake
}

export interface Goal {
  goalId: string; // Primary key
  userId: string; // Owner's Cognito sub
  goalType: string;
  goalName: string;
  generalObjective: string;
  deadline: string; // ISO 8601 — equals the last milestone's deadline
  milestones: Milestone[];
  allOrNothing: boolean; // true: the stake settles once, all milestones or nothing
  stake: number; // escrowed from the user's balance when the goal is created
  createdAt: string;
  updatedAt: string;
  status: GoalStatus;
}

export enum GoalStatus {
  created = 'created', // no milestone resolved yet — stake can still be changed
  inProgress = 'inProgress', // at least one milestone resolved
  completed = 'completed', // every milestone resolved (any mix of wins/misses)
  failed = 'failed', // all-or-nothing goal with a missed milestone
  cancelled = 'cancelled',
}

/** One money/stars movement recorded in a transaction. */
export interface TransactionEntry {
  /**
   * escrow:  balance → pendingBalance (goal created)
   * refund:  pendingBalance → balance (milestone/goal won, or cancelled)
   * forfeit: pendingBalance removed (milestone/goal missed)
   * stars:   stars credited for a win
   */
  type: 'escrow' | 'refund' | 'forfeit' | 'stars';
  amount: number;
  reason: string;
}

export type TransactionOutcome = 'escrowed' | 'won' | 'lost' | 'mixed' | 'cancelled';

export interface Transaction {
  transactionId: string;
  goalId: string;
  userId: string;
  timestamp: string;
  outcome: TransactionOutcome;
  entries: TransactionEntry[];
  milestonesSummary: {
    total: number;
    completed: number;
    missed: number; // completion === false
  };
  goalSnapshot: {
    goalName: string;
    allOrNothing: boolean;
    stake: number;
  };
}

export interface PaymentConfig {
  provider: string; // 'stub' until a real payment provider is integrated
  configuredAt: string;
  details?: Record<string, unknown>;
}

export interface User {
  userId: string;
  username: string;
  email: string;
  goalIds: string[];
  balance: number; // available play money
  pendingBalance: number; // escrowed in active goals
  stars: number;
  playMoney: boolean;
  paymentConfig?: PaymentConfig;
}
