import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { Goal, GoalStatus, Transaction, TransactionEntry } from './models';

export function computeCompletionPercentage(milestones: { completion?: boolean }[]): number {
  if (milestones.length === 0) return 0;
  const completed = milestones.filter(m => m.completion === true).length;
  return Math.round((completed / milestones.length) * 1000) / 10;
}

export function allMilestonesResolved(milestones: { completion?: boolean }[]): boolean {
  return milestones.every(m => m.completion !== undefined);
}

export function buildTransactionEntries(goal: Goal): { entries: TransactionEntry[]; outcome: 'reward' | 'penalty' | 'mixed' } {
  const entries: TransactionEntry[] = [];

  if (goal.allOrNothing) {
    const anyMissed = goal.milestones.some(m => m.completion === false);
    if (anyMissed) {
      const penaltyAmount = goal.totalAmount * (1 + goal.penaltyInterestRate / 100);
      entries.push({
        type: 'penalty',
        destination: goal.penaltyDestination,
        amount: penaltyAmount,
        reason: 'All-or-nothing goal failed: one or more milestones missed',
      });
      return { entries, outcome: 'penalty' };
    } else {
      entries.push({
        type: 'reward',
        destination: goal.rewardDestination,
        amount: goal.totalAmount,
        reason: 'All-or-nothing goal completed: all milestones achieved',
      });
      return { entries, outcome: 'reward' };
    }
  }

  let hasReward = false;
  let hasPenalty = false;

  for (const milestone of goal.milestones) {
    if (milestone.completion) {
      entries.push({
        type: 'reward',
        destination: goal.rewardDestination,
        amount: milestone.monetaryValue,
        reason: `Milestone completed: ${milestone.milestoneName}`,
      });
      hasReward = true;
    } else if (milestone.completion === false) {
      const penaltyAmount = milestone.monetaryValue * (1 + goal.penaltyInterestRate / 100);
      entries.push({
        type: 'penalty',
        destination: goal.penaltyDestination,
        amount: penaltyAmount,
        reason: `Milestone missed: ${milestone.milestoneName}`,
      });
      hasPenalty = true;
    }
  }

  const outcome: 'reward' | 'penalty' | 'mixed' = hasReward && hasPenalty ? 'mixed' : hasPenalty ? 'penalty' : 'reward';
  return { entries, outcome };
}

export async function writeTransaction(
  dynamoDb: DynamoDB.DocumentClient,
  transactionsTable: string,
  goal: Goal,
  entries: TransactionEntry[],
  outcome: 'reward' | 'penalty' | 'mixed',
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
      totalAmount: goal.totalAmount,
      allOrNothing: goal.allOrNothing,
      penaltyInterestRate: goal.penaltyInterestRate,
    },
  };

  await dynamoDb.put({ TableName: transactionsTable, Item: transaction }).promise();
}

export async function updateGoalStatus(
  dynamoDb: DynamoDB.DocumentClient,
  goalsTable: string,
  goalId: string,
  status: GoalStatus,
): Promise<void> {
  await dynamoDb.update({
    TableName: goalsTable,
    Key: { goalId },
    UpdateExpression: 'set #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': status,
      ':updatedAt': new Date().toISOString(),
    },
  }).promise();
}
