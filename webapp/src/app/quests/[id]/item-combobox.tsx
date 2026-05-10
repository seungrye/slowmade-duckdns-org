"use client";

import { useId } from "react";
import type { ItemDocument } from "@/types/item";

interface Props {
  value: string;
  onChange: (v: string) => void;
  items: ItemDocument[];
  placeholder?: string;
  className?: string;
}

function summarize(item: ItemDocument): string {
  switch (item.kind) {
    case "quest":      return "quest";
    case "weapon":     return `weapon · ATK ${item.attackPower}${item.element ? ` (${item.element})` : ""}`;
    case "armor":      return `armor · DEF +${item.defenseBonus}`;
    case "consumable": return `consumable · ${item.effect.type} +${item.effect.amount}`;
  }
}

export function ItemCombobox({
  value,
  onChange,
  items,
  placeholder = "item id",
  className = "",
}: Props) {
  const listId = useId();
  const trimmed = value.trim();
  const matched = trimmed.length > 0 ? items.find((i) => i.id === trimmed) : undefined;
  const isUnknown = trimmed.length > 0 && !matched;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <input
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 min-w-0 border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 font-mono ${className}`}
        />
        {isUnknown && (
          <span
            className="text-yellow-500 text-xs"
            title="카탈로그에 등록되지 않은 id — 오타가 아닌지 확인하세요"
          >
            ?
          </span>
        )}
      </div>
      <datalist id={listId}>
        {items.map((it) => (
          <option key={it.id} value={it.id}>
            {it.displayName} ({summarize(it)})
          </option>
        ))}
      </datalist>
      {matched && (
        <div className="text-[10px] text-gray-400">
          {matched.displayName} · {summarize(matched)}
        </div>
      )}
    </div>
  );
}
