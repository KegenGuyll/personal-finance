export interface BudgetGroup {
  _id?: string;
  name: string;
  percentage: number;
  categories: string[];
  sortOrder: number;
  createdAt: Date;
}

export interface Budget {
  _id?: string;
  month: string;
  groupId: string;
  category: string;
  plannedAmount: number;
  carryoverFromPrevious: number;
  carryoverDecision?: CarryoverDecision;
  createdAt: Date;
  updatedAt: Date;
}

export interface CarryoverDecision {
  decision: "carryover" | "savings" | "goal" | "reset";
  goalId?: string;
  resolvedAt: Date;
}

export interface IncomePattern {
  _id?: string;
  name: string;
  incomeCategory: string;
  createdAt: Date;
}

export interface GoalContribution {
  amount: number;
  date: string;
  source: "manual" | "transfer";
  transactionId?: string;
}

export interface Goal {
  _id?: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  currentAmount: number;
  monthlyContribution: number;
  isFeasible: boolean;
  linkedAccountId?: string;
  contributions: GoalContribution[];
  createdAt: Date;
  updatedAt: Date;
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
  hasUnresolvedCarryover: boolean;
  suggestedAmount: number;
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

export interface CarryoverItem {
  category: string;
  month: string;
  underspentAmount: number;
  hasDecision: boolean;
  decision?: string;
}

export interface CategoryMapping {
  _id?: string;
  plaidLeafCategory: string;
  budgetCategory: string;
  groupName: string;
}

export type TransactionType = "expense" | "income" | "transfer";
