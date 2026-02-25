export type TransactionType = 'income' | 'expense' | 'saving';

export interface Account {
  id: string;
  name: string;
  initial_balance: number;
  color: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  date: string; // ISO string
  account_id?: string;
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  balance: number;
}
