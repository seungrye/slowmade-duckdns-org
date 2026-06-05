// 인벤토리 표시 헬퍼 — #220.
//
// reducer 가 다루는 인벤은 `string[]` (아이템 id 의 평면 배열) 이라 같은 id 가
// 반복될 수 있다 (stackable consumable). UI 에서는 같은 id 를 한 묶음으로
// 보여 주는 게 자연스러우므로, id 별 count 누적 + displayName 결합 작업을
// 한곳에 모은다.

import { items } from "@/content/web-adventure/items";

export type GroupedInventoryEntry = {
  id: string;
  displayName: string;
  count: number;
};

/**
 * inventory 의 아이템 id 배열을 displayName + count 페어 배열로 변환.
 *
 * - 같은 id 가 여러 개면 count 누적.
 * - 진입 순서 (첫 등장 위치) 보존.
 * - 아이템 정의 미존재 id 는 fallback 으로 id 자체를 displayName 으로 사용.
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
 * 사용자 표시용 문자열.
 *
 * - count === 1 → "이름"
 * - count > 1   → "이름 × N"
 */
export function formatGroupedItem(entry: GroupedInventoryEntry): string {
  return entry.count > 1
    ? `${entry.displayName} × ${entry.count}`
    : entry.displayName;
}
