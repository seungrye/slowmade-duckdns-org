"use client";

import { useId } from "react";
import type { ZoneDocument } from "@/types/zone";

interface Props {
  value: string;
  onChange: (v: string) => void;
  zones: ZoneDocument[];
  placeholder?: string;
  className?: string;
}

export function ZoneCombobox({
  value,
  onChange,
  zones,
  placeholder = "zone id",
  className = "",
}: Props) {
  const listId = useId();
  const trimmed = value.trim();
  const matched = trimmed.length > 0 ? zones.find((z) => z.name === trimmed) : undefined;
  const isUnknown = trimmed.length > 0 && !matched;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <input
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={placeholder}
          className={`flex-1 min-w-0 border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 font-mono ${className}`}
        />
        {isUnknown && (
          <span
            className="text-yellow-500 text-xs"
            title="카탈로그에 등록되지 않은 zone — 오타가 아닌지 확인하세요"
          >
            ?
          </span>
        )}
      </div>
      <datalist id={listId}>
        {zones.map((z) => (
          <option key={z.name} value={z.name}>
            ({z.generator}){z.description ? ` — ${z.description}` : ""}
          </option>
        ))}
      </datalist>
      {matched && (
        <div className="text-[10px] text-gray-400">
          generator: <span className="font-mono">{matched.generator}</span>
          {matched.description ? ` · ${matched.description}` : ""}
        </div>
      )}
    </div>
  );
}
