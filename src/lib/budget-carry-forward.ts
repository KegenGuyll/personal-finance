import { ObjectId, type Db } from "mongodb";
import type { Budget, CarryForwardPreview } from "@/src/types/budget";
import { getCurrentMonth } from "@/src/lib/month-utils";

export interface CarryForwardInput {
  month: string;
  category: string;
  plannedAmount: number;
}

export interface CarryForwardBudgetItem extends CarryForwardInput {
  groupId: string;
}

export function getFutureBudgetMonthsForCategory(
  db: Db,
  category: string,
  anchorMonth: string
): Promise<Budget[]> {
  const currentMonth = getCurrentMonth();
  return db
    .collection<Budget>("budgets")
    .find({ category, month: { $gt: anchorMonth, $lte: currentMonth } })
    .sort({ month: 1 })
    .toArray();
}

export async function getCarryForwardPreview(
  db: Db,
  item: CarryForwardInput
): Promise<CarryForwardPreview> {
  const future = await getFutureBudgetMonthsForCategory(db, item.category, item.month);

  return {
    anchorMonth: item.month,
    category: item.category,
    months: future.map((b) => ({
      month: b.month,
      currentAmount: b.plannedAmount,
      wouldChange: b.plannedAmount !== item.plannedAmount,
    })),
  };
}

export async function upsertBudgetCarryForward(
  db: Db,
  item: CarryForwardBudgetItem
): Promise<{ affectedMonths: string[] }> {
  const future = await getFutureBudgetMonthsForCategory(db, item.category, item.month);

  const upsert = (month: string) => ({
    updateOne: {
      filter: { month, category: item.category },
      update: {
        $set: {
          month,
          groupId: new ObjectId(item.groupId),
          category: item.category,
          plannedAmount: item.plannedAmount,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  });

  const ops = [upsert(item.month), ...future.map((b) => upsert(b.month))];

  await db.collection("budgets").bulkWrite(ops);

  return { affectedMonths: [item.month, ...future.map((b) => b.month)] };
}
