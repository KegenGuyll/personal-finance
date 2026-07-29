import { plaidClient } from "@/src/lib/plaid";
import { CountryCode, Products } from "plaid";

export async function POST() {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "single-user" },
      client_name: "Personal Finance",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return Response.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("Error creating link token:", error);
    return Response.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
