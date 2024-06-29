export interface Milestone {
  milestoneName: string;
  type: string;
  completion: boolean;
  milestoneCounter: number; // Counter to keep track of milestones
  milestoneDeadline: string; // ISO 8601 date string
  monetaryValue: number;
}

export interface Rule {
  ruleId: string; // Primary Key
  planId: string; // Foreign Key, references SavingsPlans
  ruleType: string;
  ruleName: string;
  generalObjective: string;
  totalAmount: number;
  deadline: string; // ISO 8601 date string
  milestones: Milestone[];
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}

// Interface for SavingsPlans table items
export interface SavingsPlan {
  planId: string; // Primary Key
  userId: string; // Foreign Key, references Users
  planName: string;
  amount: number;
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
}