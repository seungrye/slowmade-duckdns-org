"use client";

import type { Condition } from "@/types/quest";

interface Props {
  condition: Condition;
  onChange: (c: Condition) => void;
}

export function ConditionEditor({ condition, onChange }: Props) {
  return (
    <div className="space-y-2">
      <select
        value={condition.type}
        onChange={(e) => {
          const t = e.target.value as Condition["type"];
          if (t === "Always") onChange({ type: "Always" });
          else if (t === "FlagIs") onChange({ type: "FlagIs", flag: "", value: "" });
          else onChange({ type: "HasItem", itemId: "" });
        }}
        className="w-full border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800"
      >
        <option value="Always">Always (무조건)</option>
        <option value="FlagIs">FlagIs (플래그 값 비교)</option>
        <option value="HasItem">HasItem (아이템 보유)</option>
      </select>

      {condition.type === "FlagIs" && (
        <div className="flex gap-1">
          <input
            value={condition.flag}
            onChange={(e) => onChange({ ...condition, flag: e.target.value })}
            placeholder="flag 이름"
            className="flex-1 border rounded px-2 py-1 text-xs"
          />
          <span className="self-center text-xs text-gray-400">=</span>
          <input
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="값"
            className="flex-1 border rounded px-2 py-1 text-xs"
          />
        </div>
      )}

      {condition.type === "HasItem" && (
        <input
          value={condition.itemId}
          onChange={(e) => onChange({ ...condition, itemId: e.target.value })}
          placeholder="아이템 ID"
          className="w-full border rounded px-2 py-1 text-xs"
        />
      )}
    </div>
  );
}
