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
  placeholder = "NPC 이름",
  className = "",
}: Props) {
  const listId = useId();
  const trimmed = value.trim();
  const matched = trimmed.length > 0
    ? villagers.find((v) => v.name === trimmed)
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
            title="카탈로그에 등록되지 않은 이름 — 오타가 아닌지 확인하세요"
          >
            ?
          </span>
        )}
      </div>
      <datalist id={listId}>
        {villagers.map((v) => (
          <option key={v.name} value={v.name}>
            {v.questId ? `(quest: ${v.questId})` : "일반"}
          </option>
        ))}
      </datalist>
      {matched?.questId && (
        <div className="text-[10px] text-gray-400">quest: {matched.questId}</div>
      )}
    </div>
  );
}
