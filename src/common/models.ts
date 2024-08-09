export interface Milestone {
  milestoneName: string;
  milestoneId: string;
  type: string;
  completion: boolean;
  milestoneCounter: number; // Counter to keep track of milestones
  milestoneDeadline: string; // ISO 8601 date string
  monetaryValue: number;
}

export interface Rule {
  ruleId: string; // Primary Key
  userId: string; // the user id who owns this plan
  ruleType: string;
  ruleName: string;
  generalObjective: string;
  totalAmount: number;
  deadline: string; // ISO 8601 date string
  milestones: Milestone[];
  createdAt: string; // ISO 8601 date string
  updatedAt: string; // ISO 8601 date string
  status: RuleStatus;
}

export enum RuleStatus {
  created = 'created',
  in_progress = 'inProgress',
  completed = 'completed'
}

export interface User {
  userId: string;
  username: string;
  email: string;
  ruleIds: string[];
  alpacaCreated?: boolean; 
}