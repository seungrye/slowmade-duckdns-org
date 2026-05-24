"use client";

import { useId } from "react";
import type { VillagerDocument } from "@/types/villager";

interface Props {
  value: string;
  onChange: (v: string) => void;
  villagers: VillagerDocument[];
  placeholder?: string;
  className?: string;
}

export function NpcCombobox({
  value,
  onChange,
  villagers,
  placeholder = "NPC id",
  className = "",
}: Props) {
  const listId = useId();
  const trimmed = value.trim();
  // 값은 villager id (퀘스트 giver_npc / KillNpc 가 참조하는 식별자)
  const matched = trimmed.length > 0
    ? villagers.find((v) => v.id === trimmed)
    : undefined;

  const isUnknown = trimmed.length > 0 && !matched;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <input
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 min-w-0 border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 ${className}`}
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
        {villagers.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </datalist>
      {matched && (
        <div className="text-[10px] text-gray-400">{matched.name}</div>
      )}
    </div>
  );
}
