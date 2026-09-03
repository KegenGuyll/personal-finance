export function getMonthKey(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getPreviousMonth(month: string): string {
  return getMonthKey(month, -1);
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function getEndOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

export function getLastMonths(count: number, endMonth: string = getPreviousMonth(getCurrentMonth())): string[] {
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    result.push(getMonthKey(endMonth, -i));
  }
  return result;
}
