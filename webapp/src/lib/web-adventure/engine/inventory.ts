// The inventory display helper - #220.
//
// The inventory the reducer handles is a `string[]` (a flat array of item ids), so the same id can
// repeat (a stackable consumable). Showing the same id as one group is more natural in the UI, so
// accumulating the per-id count and joining the displayName are gathered
// in one place.

import { items } from "@/content/web-adventure/items";

export type GroupedInventoryEntry = {
  id: string;
  displayName: string;
  count: number;
};

/**
 * Converts the inventory's item id array into displayName plus count pairs.
 *
 * - Several of the same id accumulate a count.
 * - The entry order (first appearance) is preserved.
 * - An id with no item definition falls back to using the id itself as the displayName.
 */
export function groupInventory(inventory: string[]): GroupedInventoryEntry[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const id of inventory) {
    const prev = counts.get(id);
    if (prev === undefined) {
      order.push(id);
      counts.set(id, 1);
    } else {
      counts.set(id, prev + 1);
    }
  }
  return order.map((id) => ({
    id,
    displayName: items[id]?.displayName ?? id,
    count: counts.get(id) ?? 0,
  }));
}

/**
 * The string shown to the user.
 *
 * - count === 1 -> "name"
 * - count > 1   -> "name x N"
 */
export function formatGroupedItem(entry: GroupedInventoryEntry): string {
  return entry.count > 1
    ? `${entry.displayName} × ${entry.count}`
    : entry.displayName;
}
