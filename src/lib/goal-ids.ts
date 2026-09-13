import { ObjectId } from "mongodb";

/**
 * Builds a Mongo `$in` match for goal ids that accepts both representations of
 * an id that exist in the wild.
 *
 * The app writes `goalId` as a string (the goal id from the URL / JSON), but
 * `scripts/migrate-goal-contributions.mjs` imported historical contributions
 * with `goalId: goal._id` — an ObjectId. Mongo compares BSON types strictly, so
 * a query matching only one form silently drops the other: string rows were
 * invisible to the savings-buffer accounting, and ObjectId rows could not be
 * deleted.
 *
 * Matching both keeps every pre-existing allocation working without requiring
 * `scripts/normalize-goal-contribution-ids.mjs` to have been run first. Once
 * that script has converted the remaining ObjectIds the extra values simply
 * match nothing.
 */
export function goalIdInMatch(goalIds: string[]): {
  $in: (string | ObjectId)[];
} {
  const values: (string | ObjectId)[] = [];
  for (const id of goalIds) {
    values.push(id);
    if (ObjectId.isValid(id)) {
      values.push(new ObjectId(id));
    }
  }
  return { $in: values };
}
