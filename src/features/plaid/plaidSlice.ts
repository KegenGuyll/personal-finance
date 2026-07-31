import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface Transaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name: string | null;
  category: string[] | null;
  pending: boolean;
  payment_channel: string;
  iso_currency_code: string | null;
  datetime: string | null;
  authorized_date: string | null;
  userModified?: boolean;
}

export interface AccountBalance {
  available: number | null;
  current: number;
  iso_currency_code: string | null;
}

export interface Account {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: AccountBalance;
}

export interface PlaidState {
  linkToken: string | null;
  isLinked: boolean;
  isLoading: boolean;
  error: string | null;
  accounts: Account[];
  accountsLoaded: boolean;
}

const initialState: PlaidState = {
  linkToken: null,
  isLinked: false,
  isLoading: false,
  error: null,
  accounts: [],
  accountsLoaded: false,
};

const plaidSlice = createSlice({
  name: "plaid",
  initialState,
  reducers: {
    setLinkToken(state, action: PayloadAction<string>) {
      state.linkToken = action.payload;
    },
    clearLinkToken(state) {
      state.linkToken = null;
    },
    setLinked(state) {
      state.isLinked = true;
      state.error = null;
    },
    setAccounts(state, action: PayloadAction<Account[]>) {
      state.accounts = action.payload;
      state.accountsLoaded = true;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const {
  setLinkToken,
  clearLinkToken,
  setLinked,
  setAccounts,
  setLoading,
  setError,
} = plaidSlice.actions;

export default plaidSlice.reducer;
