// Interface for Milestone object
export interface Milestone {
    milestoneName: string;
    type: string;
    completion: boolean;
    milestoneAmount: number;
    milestoneDeadline: string; // ISO 8601 date string
    monetaryValue: number;
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
  
  // Interface for Rules table items
  export interface Rule {
    ruleId: string; // Primary Key
    planId: string; // Foreign Key, references SavingsPlans
    ruleType: string;
    milestones: Milestone[];
    totalAmount: number;
    createdAt: string; // ISO 8601 date string
    updatedAt: string; // ISO 8601 date string
  }
  