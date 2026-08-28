import { configureStore } from "@reduxjs/toolkit";
import plaidReducer from "@/src/features/plaid/plaidSlice";
import uiReducer from "@/src/features/ui/uiSlice";

export function makeStore() {
  return configureStore({
    reducer: {
      plaid: plaidReducer,
      ui: uiReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
