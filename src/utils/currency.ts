export function formatCurrency(amount: number, currency: string | null = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
  }).format(amount);
}
