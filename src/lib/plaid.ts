import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let _plaid: PlaidApi | null = null;

function getPlaidClient(): PlaidApi {
  if (_plaid) return _plaid;
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set");
  }
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;
  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  _plaid = new PlaidApi(configuration);
  return _plaid;
}

// Lazily created on first use so `next build` (which evaluates route modules
// without env at build time) does not fail. Methods are bound to the real
// client; secrets are still required at runtime.
export const plaidClient = new Proxy({} as PlaidApi, {
  get(_t, prop) {
    const target = getPlaidClient() as unknown as Record<string | symbol, unknown>;
    const value = target[prop];
    return typeof value === "function" ? value.bind(getPlaidClient()) : value;
  },
});
