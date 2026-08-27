export interface BudgetGroup {
  _id?: string;
  name: string;
  percentage: number;
  categories: string[];
  sortOrder: number;
  createdAt: Date;
}

export interface BudgetCategory {
  _id?: string;
  name: string;
  isBudgeted: boolean;
  sortOrder?: number;
  createdAt: Date;
}

export interface Budget {
  _id?: string;
  month: string;
  groupId: string;
  category: string;
  plannedAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IncomePattern {
  _id?: string;
  name: string;
  incomeCategory: string;
  createdAt: Date;
}

export interface GoalContribution {
  _id?: string;
  goalId?: string;
  amount: number;
  date: string;
  source: "manual" | "transfer";
  transactionId?: string;
  createdAt?: Date;
}

export interface Goal {
  _id?: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  startDate?: string;
  currentAmount: number;
  monthlyContribution: number;
  isFeasible: boolean;
  linkedAccountId?: string;
  contributionIds: string[];
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contributions?: GoalContribution[];
  allocatedThisMonth?: number;
}

export interface BudgetCategorySummary {
  category: string;
  plaidLeaves: string[];
  groupId: string;
  plannedAmount: number;
  actualAmount: number;
  remaining: number;
  percentUsed: number;
  carryoverFromPrevious: number;
  suggestedAmount: number;
  dailyLimit?: number;
}

export interface UnbudgetedCategorySummary {
  category: string;
  actualAmount: number;
  plaidLeaves: string[];
}

export interface BudgetGroupSummary {
  groupId: string;
  name: string;
  percentage: number;
  targetAmount: number;
  plannedAmount: number;
  actualAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  percentUsed: number;
  categories: BudgetCategorySummary[];
  unbudgetedAmount: number;
  unbudgetedCategories: UnbudgetedCategorySummary[];
}

export interface BudgetSummary {
  month: string;
  groups: BudgetGroupSummary[];
  totalTarget: number;
  totalPlanned: number;
  totalActual: number;
  transactionType?: "expense" | "income" | "transfer";
}

export interface BudgetHealth {
  month: string;
  totalIncome: number;
  expectedIncome: number;
  totalExpenses: number;
  net: number;
  savingsGroupPlanned: number;
  savingsGroupActual: number;
  surplus: number;
  savingsRate: number;
}

export interface CategoryMapping {
  _id?: string;
  plaidLeafCategory: string;
  budgetCategory: string;
  groupName: string;
}

export interface TransactionCategoryRule {
  _id?: string;
  account_id: string;
  name: string;
  category: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type TransactionType = "expense" | "income" | "transfer";
