/**
 * Shared logic for manually entered ("temporary") transactions.
 *
 * A manual transaction records a purchase (or deposit) that Plaid has not
 * synced yet. It lives in the same `transactions` collection as synced rows and
 * carries `manual: true`, so every existing budget, category, trend and goal
 * aggregate counts it with no pipeline changes. Once the real transaction syncs
 * the user links the two from the real transaction's detail page: the fields
 * below are copied across and the manual row is deleted, so nothing is ever
 * counted twice.
 *
 * This module is isomorphic on purpose — the API routes validate and build
 * documents with it, and the client components reuse the same ranking,
 * compatibility and preview helpers. It must not import anything server-only.
 */

/**
 * Marker constant for manual entry ids. The `manual: true` flag on a document
 * is the authoritative test — the prefix only makes manual rows recognisable in
 * logs and URLs, and is never used for authorisation.
 */
export const MANUAL_ID_PREFIX = "manual_";

export const MAX_NAME_LENGTH = 200;
export const MAX_AMOUNT = 1_000_000;
export const MAX_CATEGORY_DEPTH = 5;
export const MAX_CATEGORY_PART_LENGTH = 100;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type ManualTransactionType = "expense" | "income";

export interface ManualTransactionInput {
  accountId: string;
  name: string;
  /** Always a positive magnitude; the stored sign is derived from `type`. */
  amount: number;
  type: ManualTransactionType;
  /** YYYY-MM-DD */
  date: string;
  category: string[] | null;
  isoCurrencyCode: string;
}

export type ManualTransactionPatch = Partial<ManualTransactionInput>;

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Marks a document as a manual entry. The `manual` flag on the document is the
 * authoritative test — the id prefix only makes manual rows recognisable in
 * logs and URLs, so `isManual` is never used for authorisation.
 */
export function newManualTransactionId(): string {
  return `${MANUAL_ID_PREFIX}${crypto.randomUUID()}`;
}

/**
 * Plaid reports money leaving an account as a positive amount, so an income
 * entry is stored negative. Mirrors the sign convention used by
 * `app/api/transactions/[id]/mark-income` and the budget pipelines.
 */
export function toSignedAmount(
  amount: number,
  type: ManualTransactionType
): number {
  return type === "income" ? -Math.abs(amount) : Math.abs(amount);
}

/**
 * Normalises a category into the array form the app stores (leaf = last
 * element), accepting either `"Food and Drink > Restaurants"` — the format the
 * category editor and the `categories` collection use — or an array.
 */
export function parseCategoryInput(
  value: unknown
): ParseResult<string[] | null> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }

  let levels: string[];
  if (typeof value === "string") {
    levels = value.split(">");
  } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    levels = value;
  } else {
    return { ok: false, error: "Category must be text" };
  }

  const parts = levels.map((level) => level.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: true, value: null };
  if (parts.length > MAX_CATEGORY_DEPTH) {
    return {
      ok: false,
      error: `Category can be at most ${MAX_CATEGORY_DEPTH} levels deep`,
    };
  }
  if (parts.some((part) => part.length > MAX_CATEGORY_PART_LENGTH)) {
    return {
      ok: false,
      error: `Each category name must be ${MAX_CATEGORY_PART_LENGTH} characters or fewer`,
    };
  }

  return { ok: true, value: parts };
}

function parseName(value: unknown): ParseResult<string> {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: "Name is required" };
  }
  const name = value.trim();
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name must be ${MAX_NAME_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, value: name };
}

function parseAmount(value: unknown): ParseResult<number> {
  const amount = typeof value === "string" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return { ok: false, error: "Amount must be a number" };
  }
  if (amount > MAX_AMOUNT) {
    return { ok: false, error: `Amount must be at most ${MAX_AMOUNT}` };
  }
  // Round before judging positivity: 0.001 would otherwise pass a `> 0` check and
  // be stored as a zero-value transaction.
  const rounded = Math.round(amount * 100) / 100;
  if (rounded < 0.01) {
    return { ok: false, error: "Amount must be at least 0.01" };
  }
  return { ok: true, value: rounded };
}

function parseDate(value: unknown): ParseResult<string> {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return { ok: false, error: "Date must be formatted YYYY-MM-DD" };
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "Date is not a real calendar date" };
  }
  return { ok: true, value };
}

function parseType(value: unknown): ParseResult<ManualTransactionType> {
  if (value === "expense" || value === "income") {
    return { ok: true, value };
  }
  return { ok: false, error: 'Type must be "expense" or "income"' };
}

function parseCurrency(value: unknown): ParseResult<string> {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: "USD" };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Currency must be a 3-letter code" };
  }
  const code = value.trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(code)) {
    return { ok: false, error: "Currency must be a 3-letter code" };
  }
  return { ok: true, value: code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseManualTransactionInput(
  body: unknown
): ParseResult<ManualTransactionInput> {
  if (!isRecord(body)) return { ok: false, error: "Invalid request body" };

  const accountId =
    typeof body.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) return { ok: false, error: "An account is required" };

  const name = parseName(body.name);
  if (!name.ok) return name;

  const amount = parseAmount(body.amount);
  if (!amount.ok) return amount;

  const type = parseType(body.type);
  if (!type.ok) return type;

  const date = parseDate(body.date);
  if (!date.ok) return date;

  const category = parseCategoryInput(body.category);
  if (!category.ok) return category;

  const currency = parseCurrency(body.isoCurrencyCode);
  if (!currency.ok) return currency;

  return {
    ok: true,
    value: {
      accountId,
      name: name.value,
      amount: amount.value,
      type: type.value,
      date: date.value,
      category: category.value,
      isoCurrencyCode: currency.value,
    },
  };
}

/**
 * Validates a partial update. Only the fields actually present are validated
 * and returned, so a PATCH never silently clears fields it did not mention.
 */
export function parseManualTransactionPatch(
  body: unknown
): ParseResult<ManualTransactionPatch> {
  if (!isRecord(body)) return { ok: false, error: "Invalid request body" };

  const patch: ManualTransactionPatch = {};
  let hasField = false;

  if ("accountId" in body) {
    const accountId =
      typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) return { ok: false, error: "An account is required" };
    patch.accountId = accountId;
    hasField = true;
  }

  if ("name" in body) {
    const name = parseName(body.name);
    if (!name.ok) return name;
    patch.name = name.value;
    hasField = true;
  }

  if ("amount" in body) {
    const amount = parseAmount(body.amount);
    if (!amount.ok) return amount;
    patch.amount = amount.value;
    hasField = true;
  }

  if ("type" in body) {
    const type = parseType(body.type);
    if (!type.ok) return type;
    patch.type = type.value;
    hasField = true;
  }

  if ("date" in body) {
    const date = parseDate(body.date);
    if (!date.ok) return date;
    patch.date = date.value;
    hasField = true;
  }

  if ("category" in body) {
    const category = parseCategoryInput(body.category);
    if (!category.ok) return category;
    patch.category = category.value;
    hasField = true;
  }

  if ("isoCurrencyCode" in body) {
    const currency = parseCurrency(body.isoCurrencyCode);
    if (!currency.ok) return currency;
    patch.isoCurrencyCode = currency.value;
    hasField = true;
  }

  if (!hasField) return { ok: false, error: "No fields to update" };
  return { ok: true, value: patch };
}

export function parseLinkManualTransactionInput(
  body: unknown
): ParseResult<{ manualTransactionId: string }> {
  if (!isRecord(body)) return { ok: false, error: "Invalid request body" };

  const manualTransactionId =
    typeof body.manualTransactionId === "string"
      ? body.manualTransactionId.trim()
      : "";
  if (!manualTransactionId) {
    return { ok: false, error: "manualTransactionId is required" };
  }

  return { ok: true, value: { manualTransactionId } };
}

export interface ManualEntrySnapshot {
  name: string;
  amount: number;
  date: string;
  category: string[] | null;
}

export interface ManualTransactionDoc {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name: null;
  category: string[] | null;
  pending: true;
  manual: true;
  payment_channel: "";
  iso_currency_code: string;
  datetime: null;
  authorized_date: null;
  pending_transaction_id: null;
  transaction_type?: "income";
  income_category?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function buildManualTransactionDoc(
  input: ManualTransactionInput,
  now: Date = new Date()
): ManualTransactionDoc {
  const doc: ManualTransactionDoc = {
    transaction_id: newManualTransactionId(),
    account_id: input.accountId,
    amount: toSignedAmount(input.amount, input.type),
    date: input.date,
    name: input.name,
    merchant_name: null,
    category: input.category,
    pending: true,
    manual: true,
    payment_channel: "",
    iso_currency_code: input.isoCurrencyCode,
    datetime: null,
    authorized_date: null,
    pending_transaction_id: null,
    createdAt: now,
    updatedAt: now,
  };

  // Expense rows carry no transaction_type, exactly like synced rows, so the
  // existing "expense" filters keep working untouched.
  if (input.type === "income") {
    doc.transaction_type = "income";
    doc.income_category = "Income";
  }

  return doc;
}

export interface ManualUpdateSpec {
  set: Record<string, unknown>;
  unset: Record<string, "">;
}

/**
 * Turns a validated patch into `$set`/`$unset` operations.
 *
 * Flipping an entry to income clears any goal assignment, mirroring
 * `POST /api/transactions/[id]/mark-income`: a transaction cannot be both
 * income and goal-funded spending.
 */
export function buildManualTransactionUpdate(
  existing: { amount: number; transaction_type?: unknown },
  patch: ManualTransactionPatch,
  now: Date = new Date()
): ManualUpdateSpec {
  const set: Record<string, unknown> = { updatedAt: now };
  const unset: Record<string, ""> = {};

  if (patch.accountId !== undefined) set.account_id = patch.accountId;
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.date !== undefined) set.date = patch.date;
  if (patch.category !== undefined) set.category = patch.category;
  if (patch.isoCurrencyCode !== undefined) {
    set.iso_currency_code = patch.isoCurrencyCode;
  }

  const existingType: ManualTransactionType =
    existing.transaction_type === "income" ? "income" : "expense";
  if (patch.amount !== undefined || patch.type !== undefined) {
    const magnitude =
      patch.amount !== undefined ? patch.amount : Math.abs(existing.amount);
    set.amount = toSignedAmount(magnitude, patch.type ?? existingType);
  }

  if (patch.type === "income") {
    set.transaction_type = "income";
    set.income_category = "Income";
    unset.goalId = "";
  } else if (patch.type === "expense") {
    unset.transaction_type = "";
    unset.income_category = "";
  }

  return { set, unset };
}

/** Fields a link can copy from a manual entry onto a synced transaction. */
export type MergeField = "category" | "income" | "goal";

export interface LinkSource {
  transaction_id: string;
  name: string;
  amount: number;
  date: string;
  category: string[] | null;
  transaction_type?: string;
  goalId?: unknown;
  /** Only used for display; the API has it as a Date, the client as an ISO string. */
  createdAt?: Date | string;
}

export interface LinkTarget {
  transaction_id: string;
  amount: number;
  category: string[] | null;
  transaction_type?: string;
  goalId?: unknown;
  manualEntryId?: string;
}

export type MergePlan =
  | {
      ok: true;
      set: Record<string, unknown>;
      unset: Record<string, "">;
      mergedFields: MergeField[];
    }
  | { ok: false; status: number; error: string };

export const MERGE_FIELD_LABELS: Record<MergeField, string> = {
  category: "Category",
  income: "Marked as income",
  goal: "Spend from goal",
};

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * Computes what linking `source` (the manual entry) into `target` (the synced
 * transaction) would change, or why it cannot be linked.
 *
 * A manual entry is never counted twice: the caller deletes it after applying
 * this plan, and the copied fields are what makes the synced row match what the
 * user entered while it was still temporary.
 */
export function buildManualMerge(
  source: LinkSource,
  target: LinkTarget,
  now: Date = new Date()
): MergePlan {
  const sourceIsIncome = source.transaction_type === "income" || source.amount < 0;
  const targetIsIncome =
    target.transaction_type === "income" || target.amount < 0;

  if (sourceIsIncome && !targetIsIncome) {
    return {
      ok: false,
      status: 400,
      error:
        "That manual entry is income, so it can only be linked to an income transaction.",
    };
  }
  if (!sourceIsIncome && targetIsIncome) {
    return {
      ok: false,
      status: 400,
      error:
        "That manual entry is an expense, so it cannot be linked to an income transaction.",
    };
  }
  if (hasValue(target.manualEntryId) && target.manualEntryId !== source.transaction_id) {
    return {
      ok: false,
      status: 409,
      error: "That transaction is already linked to a manual entry.",
    };
  }

  const set: Record<string, unknown> = {
    manualEntryId: source.transaction_id,
    manualEntry: {
      name: source.name,
      amount: source.amount,
      date: source.date,
      category: source.category,
    } satisfies ManualEntrySnapshot,
    manualEntryMergedAt: now,
  };
  const unset: Record<string, ""> = {};
  const mergedFields: MergeField[] = [];

  if (source.category && source.category.length > 0) {
    // `userModified` stops plaid-sync overwriting the category on the next
    // update, exactly like a category set through the category editor.
    set.category = source.category;
    set.userModified = true;
    mergedFields.push("category");
  }

  if (sourceIsIncome && target.transaction_type !== "income") {
    set.transaction_type = "income";
    set.income_category = "Income";
    mergedFields.push("income");
  }

  if (sourceIsIncome) {
    // Income never draws down a goal (see the mark-income route).
    unset.goalId = "";
  } else if (
    hasValue(source.goalId) &&
    !hasValue(target.goalId) &&
    !targetIsIncome &&
    target.amount > 0
  ) {
    set.goalId = source.goalId;
    mergedFields.push("goal");
  }

  return { ok: true, set, unset, mergedFields };
}

/** Human-readable preview of a link, shown in the picker before confirming. */
export function summarizeManualMerge(
  source: LinkSource,
  target: LinkTarget
): string[] {
  const plan = buildManualMerge(source, target);
  if (!plan.ok) return [plan.error];

  const summary = plan.mergedFields.map((field) => MERGE_FIELD_LABELS[field]);
  if (summary.length === 0) {
    summary.push("No details to copy — the manual entry is just removed");
  }
  return summary;
}

function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T12:00:00Z`);
  const toMs = Date.parse(`${to}T12:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.round((fromMs - toMs) / (24 * 60 * 60 * 1000));
}

export interface RankedManualEntry<T> {
  entry: T;
  sameAccount: boolean;
  sameAmount: boolean;
  amountDiff: number;
  /** Entry date minus transaction date, in days. Negative means earlier. */
  daysDiff: number;
}

/**
 * Orders manual entries by how likely they are to be the one the user meant:
 * exact amount first, then the same account, then closest date (a purchase is
 * usually entered the day it happens, but tips and pending amounts move, so for
 * an equal distance the earlier entry wins — posting lags the purchase).
 */
export function rankManualEntriesForTransaction<
  T extends { account_id: string; amount: number; date: string },
>(
  target: { account_id: string; amount: number; date: string },
  entries: T[]
): RankedManualEntry<T>[] {
  return entries
    .map((entry) => ({
      entry,
      sameAccount: entry.account_id === target.account_id,
      sameAmount: Math.abs(Math.abs(entry.amount) - Math.abs(target.amount)) < 0.005,
      amountDiff: Math.abs(Math.abs(entry.amount) - Math.abs(target.amount)),
      daysDiff: daysBetween(entry.date, target.date),
    }))
    .sort((a, b) => {
      if (a.sameAmount !== b.sameAmount) return a.sameAmount ? -1 : 1;
      if (a.sameAccount !== b.sameAccount) return a.sameAccount ? -1 : 1;
      const distance = Math.abs(a.daysDiff) - Math.abs(b.daysDiff);
      if (distance !== 0) return distance;
      if (a.daysDiff !== b.daysDiff) return a.daysDiff - b.daysDiff;
      if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
      return b.entry.date.localeCompare(a.entry.date);
    });
}

/** Short relative label for a manual entry's age, e.g. "3 days old". */
export function describeAge(value: Date | string | undefined): string {
  if (!value) return "recently added";
  const created = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(created.getTime())) return "recently added";

  const days = Math.floor((Date.now() - created.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "added today";
  if (days === 1) return "1 day old";
  return `${days} days old`;
}

/** Today's date in the YYYY-MM-DD form the app stores. */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
