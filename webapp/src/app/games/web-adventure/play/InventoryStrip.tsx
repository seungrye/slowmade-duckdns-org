"use client";

// 인벤토리 1 줄 표시 — 3 주차 간단 UI. 본격 사이드 패널은 5 주차.
//
// #220 — 같은 id 의 아이템은 한 항목으로 묶어 "이름 × N" 으로 표시.
// "사용" 버튼도 그룹된 id 기준으로 한 번만 렌더.
//
// Next.js app router 의 page.tsx 는 default export 만 허용하므로 별도 파일로 분리.

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
