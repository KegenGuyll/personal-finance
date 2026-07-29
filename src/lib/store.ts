import { configureStore } from "@reduxjs/toolkit";
import plaidReducer from "@/src/features/plaid/plaidSlice";

export function makeStore() {
  return configureStore({
    reducer: {
      plaid: plaidReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
