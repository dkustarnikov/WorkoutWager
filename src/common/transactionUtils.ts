import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { Goal, GoalStatus, STARS_RATE, Transaction, TransactionEntry, TransactionOutcome } from './models';

type DocClient = DynamoDB.DocumentClient;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function computeCompletionPercentage(milestones: { completion?: boolean }[]): number {
  if (milestones.length === 0) return 0;
  const completed = milestones.filter(m => m.completion === true).length;
  return Math.round((completed / milestones.length) * 1000) / 10;
}

export function allMilestonesResolved(milestones: { completion?: boolean }[]): boolean {
  return milestones.every(m => m.completion !== undefined);
}

/** Stars for winning a stake: 10%, rounded down. */
export function computeStars(stake: number): number {
  return Math.floor(stake * STARS_RATE);
}

/** Stake of milestones that are still pending (still sitting in pendingBalance). */
export function remainingEscrowedStake(milestones: { completion?: boolean; stake: number }[]): number {
  return milestones.filter(m => m.completion === undefined).reduce((sum, m) => sum + m.stake, 0);
}

/**
 * Splits a goal stake across milestones.
 * - If every milestone has an explicit positive stake, they must sum exactly to the goal stake.
 * - Otherwise the stake is split evenly (to the cent); the last milestone absorbs rounding.
 */
export function allocateMilestoneStakes(goalStake: number, milestones: { stake?: number }[]): number[] {
  if (milestones.length === 0) {
    return [goalStake];
  }
  const allExplicit = milestones.every(m => typeof m.stake === 'number' && m.stake > 0);
  if (allExplicit) {
    const stakes = milestones.map(m => m.stake as number);
    const sum = stakes.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - goalStake) > 1e-9) {
      throw new Error(`Milestone stakes (${sum}) must sum exactly to goal stake (${goalStake})`);
    }
    return stakes;
  }
  const n = milestones.length;
  const base = Math.floor((goalStake / n) * 100) / 100;
  const stakes = Array<number>(n).fill(base);
  stakes[n - 1] = Math.round((goalStake - base * (n - 1)) * 100) / 100;
  return stakes;
}

// ---------------------------------------------------------------------------
// Balance movements — every write is conditional, so balances never go negative
// and a retried request can't move money twice past the available amount.
// ---------------------------------------------------------------------------

export class InsufficientBalanceError extends Error {
  constructor(amount: number) {
    super(`Insufficient balance to escrow stake of ${amount}`);
    this.name = 'InsufficientBalanceError';
  }
}

/** balance → pendingBalance. Throws InsufficientBalanceError if the balance is too low. */
export async function escrowStake(dynamoDb: DocClient, userInfoTable: string, userId: string, amount: number): Promise<void> {
  try {
    await dynamoDb.update({
      TableName: userInfoTable,
      Key: { userId },
      UpdateExpression: 'SET balance = balance - :amount, pendingBalance = if_not_exists(pendingBalance, :zero) + :amount',
      ConditionExpression: 'attribute_exists(userId) AND balance >= :amount',
      ExpressionAttributeValues: { ':amount': amount, ':zero': 0 },
    }).promise();
  } catch (error) {
    if ((error as { code?: string }).code === 'ConditionalCheckFailedException') {
      throw new InsufficientBalanceError(amount);
    }
    throw error;
  }
}

/** pendingBalance → balance. */
export async function releaseStake(dynamoDb: DocClient, userInfoTable: string, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await dynamoDb.update({
    TableName: userInfoTable,
    Key: { userId },
    UpdateExpression: 'SET balance = if_not_exists(balance, :zero) + :amount, pendingBalance = pendingBalance - :amount',
    ConditionExpression: 'attribute_exists(userId) AND pendingBalance >= :amount',
    ExpressionAttributeValues: { ':amount': amount, ':zero': 0 },
  }).promise();
}

/** Removes the stake from pendingBalance (it is lost). */
export async function forfeitStake(dynamoDb: DocClient, userInfoTable: string, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await dynamoDb.update({
    TableName: userInfoTable,
    Key: { userId },
    UpdateExpression: 'SET pendingBalance = pendingBalance - :amount',
    ConditionExpression: 'attribute_exists(userId) AND pendingBalance >= :amount',
    ExpressionAttributeValues: { ':amount': amount },
  }).promise();
}

/** Escrows more (delta > 0) or releases some (delta < 0) when a goal's stake changes. */
export async function adjustEscrow(dynamoDb: DocClient, userInfoTable: string, userId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  if (delta > 0) {
    await escrowStake(dynamoDb, userInfoTable, userId, delta);
  } else {
    await releaseStake(dynamoDb, userInfoTable, userId, Math.abs(delta));
  }
}

export async function creditStars(dynamoDb: DocClient, userInfoTable: string, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await dynamoDb.update({
    TableName: userInfoTable,
    Key: { userId },
    UpdateExpression: 'SET stars = if_not_exists(stars, :zero) + :amount',
    ConditionExpression: 'attribute_exists(userId)',
    ExpressionAttributeValues: { ':amount': amount, ':zero': 0 },
  }).promise();
}

// ---------------------------------------------------------------------------
// Settlement: move the money, return the entries to record
// ---------------------------------------------------------------------------

async function settleWin(dynamoDb: DocClient, userInfoTable: string, userId: string, stake: number, what: 'Milestone' | 'Goal'): Promise<TransactionEntry[]> {
  const stars = computeStars(stake);
  await releaseStake(dynamoDb, userInfoTable, userId, stake);
  await creditStars(dynamoDb, userInfoTable, userId, stars);
  const entries: TransactionEntry[] = [
    { type: 'refund', amount: stake, reason: `${what} completed — stake returned to balance` },
  ];
  if (stars > 0) {
    entries.push({ type: 'stars', amount: stars, reason: `${what} completed — 10% stars reward` });
  }
  return entries;
}

export const settleMilestoneWin = (db: DocClient, table: string, userId: string, stake: number) => settleWin(db, table, userId, stake, 'Milestone');
export const settleGoalWin = (db: DocClient, table: string, userId: string, stake: number) => settleWin(db, table, userId, stake, 'Goal');

export async function settleMilestoneLoss(dynamoDb: DocClient, userInfoTable: string, userId: string, stake: number): Promise<TransactionEntry[]> {
  await forfeitStake(dynamoDb, userInfoTable, userId, stake);
  return [{ type: 'forfeit', amount: stake, reason: 'Milestone missed — stake forfeited' }];
}

export async function settleGoalLoss(dynamoDb: DocClient, userInfoTable: string, userId: string, stake: number): Promise<TransactionEntry[]> {
  await forfeitStake(dynamoDb, userInfoTable, userId, stake);
  return [{ type: 'forfeit', amount: stake, reason: 'Goal failed — stake forfeited' }];
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export async function writeTransaction(
  dynamoDb: DocClient,
  transactionsTable: string,
  goal: Goal,
  entries: TransactionEntry[],
  outcome: TransactionOutcome,
): Promise<void> {
  const transaction: Transaction = {
    transactionId: uuidv4(),
    goalId: goal.goalId,
    userId: goal.userId,
    timestamp: new Date().toISOString(),
    outcome,
    entries,
    milestonesSummary: {
      total: goal.milestones.length,
      completed: goal.milestones.filter(m => m.completion === true).length,
      missed: goal.milestones.filter(m => m.completion === false).length,
    },
    goalSnapshot: {
      goalName: goal.goalName,
      allOrNothing: goal.allOrNothing,
      stake: goal.stake,
    },
  };
  await dynamoDb.put({ TableName: transactionsTable, Item: transaction }).promise();
}

export async function updateGoalStatus(dynamoDb: DocClient, goalsTable: string, goalId: string, status: GoalStatus): Promise<void> {
  await dynamoDb.update({
    TableName: goalsTable,
    Key: { goalId },
    UpdateExpression: 'set #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status, ':updatedAt': new Date().toISOString() },
  }).promise();
}
