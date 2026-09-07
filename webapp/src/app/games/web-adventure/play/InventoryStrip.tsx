"use client";

// The one-line inventory display - a simple week 3 UI. A proper side panel comes in week 5.
//
// #220 - items with the same id are grouped into one entry shown as "name x N".
// The "use" button is rendered once per grouped id too.
//
// A Next.js app router page.tsx allows only a default export, so this lives in its own file.

import { items } from "@/content/web-adventure/items";
import {
  groupInventory,
  formatGroupedItem,
} from "@/lib/web-adventure/engine/inventory";

export default function InventoryStrip({
  inventory,
  rerollsLeft,
  hp,
  maxHp,
  onUseItem,
  onReroll,
  canReroll,
}: {
  inventory: string[];
  rerollsLeft: number;
  hp: number;
  maxHp: number;
  onUseItem: (itemId: string) => void;
  onReroll: () => void;
  canReroll: boolean;
}) {
  const grouped = groupInventory(inventory);
  return (
    <div className="rounded-md bg-amber-100/70 border border-amber-300 p-3 mb-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span>
          HP <span className="font-mono font-bold">{hp}</span> / {maxHp}
        </span>
        <span>
          재굴림 <span className="font-mono font-bold">{rerollsLeft}</span>
        </span>
        {canReroll && rerollsLeft > 0 && (
          <button
            type="button"
            onClick={onReroll}
            className="rounded bg-amber-700 text-amber-50 px-2 py-0.5 text-xs hover:bg-amber-800"
          >
            직전 판정 다시 굴리기
          </button>
        )}
      </div>
      {grouped.length === 0 ? (
        <div className="mt-1 text-amber-700 italic">가방: 비어 있음</div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
          <span className="text-amber-800">가방:</span>
          {grouped.map((entry) => {
            const item = items[entry.id];
            const label = formatGroupedItem(entry);
            if (!item) return <span key={entry.id}>{label}</span>;
            return (
              <span key={entry.id} className="inline-flex items-center gap-1">
                <span>{label}</span>
                {item.kind === "consumable" && (
                  <button
                    type="button"
                    onClick={() => onUseItem(entry.id)}
                    className="rounded bg-amber-700 text-amber-50 px-1.5 py-0.5 text-xs hover:bg-amber-800"
                    title={item.desc}
                  >
                    사용
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
