"use client";

import type { ChoiceCondition, StatKey } from "@/types/web-adventure";

const STATS: { value: StatKey; label: string }[] = [
  { value: "str", label: "근력 (str)" },
  { value: "dex", label: "민첩 (dex)" },
  { value: "int", label: "지능 (int)" },
  { value: "cha", label: "매력 (cha)" },
  { value: "con", label: "체력 (con)" },
  { value: "wis", label: "지혜 (wis)" },
];

const inputCls = "w-full border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800";

interface Props {
  condition: ChoiceCondition;
  onChange: (c: ChoiceCondition) => void;
}

// dnd-kit listener 가 부모에 부착되어 있어도 input 의 focus 가 유지되도록.
const stopPropagation = (e: React.PointerEvent) => e.stopPropagation();

function emptyForKind(kind: ChoiceCondition["kind"]): ChoiceCondition {
  switch (kind) {
    case "minStat":
      return { kind: "minStat", stat: "str", min: 0 };
    case "hasItem":
      return { kind: "hasItem", itemId: "" };
    case "flag":
      return { kind: "flag", key: "" };
    case "minFlag":
      return { kind: "minFlag", key: "", min: 1 };
    case "ability":
      return { kind: "ability", required: "lunar" };
    case "stigmaAtLeast":
      return { kind: "stigmaAtLeast", min: 70 };
    case "stigmaAtMost":
      return { kind: "stigmaAtMost", max: 20 };
    case "all":
      return { kind: "all", conditions: [] };
  }
}

export function ConditionBuilder({ condition, onChange }: Props) {
  return (
    <div className="space-y-1 rounded border border-dashed border-gray-300 dark:border-gray-700 p-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 text-gray-500">조건 종류</span>
        <select
          aria-label="condition kind"
          value={condition.kind}
          onChange={(e) => onChange(emptyForKind(e.target.value as ChoiceCondition["kind"]))}
          onPointerDown={stopPropagation}
          className={inputCls}
        >
          <option value="minStat">스탯 최소값 (minStat)</option>
          <option value="hasItem">아이템 소지 (hasItem)</option>
          <option value="flag">플래그 (flag)</option>
          <option value="minFlag">플래그 최소값 (minFlag)</option>
        </select>
      </label>

      {condition.kind === "minStat" && (
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1 flex-1">
            <span className="text-gray-500 shrink-0">스탯</span>
            <select
              aria-label="stat"
              value={condition.stat}
              onChange={(e) => onChange({ ...condition, stat: e.target.value as StatKey })}
              onPointerDown={stopPropagation}
              className={inputCls}
            >
              {STATS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 w-32">
            <span className="text-gray-500 shrink-0">최소</span>
            <input
              aria-label="min"
              type="number"
              value={condition.min}
              onChange={(e) => onChange({ ...condition, min: Number(e.target.value) })}
              onPointerDown={stopPropagation}
              className={inputCls}
            />
          </label>
        </div>
      )}

      {condition.kind === "hasItem" && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-gray-500">아이템 ID</span>
          <input
            aria-label="itemId"
            value={condition.itemId}
            onChange={(e) => onChange({ ...condition, itemId: e.target.value })}
            onPointerDown={stopPropagation}
            placeholder="예: eternal_gem"
            className={inputCls}
          />
        </label>
      )}

      {condition.kind === "flag" && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-20 shrink-0 text-gray-500">플래그 키</span>
          <input
            aria-label="flag key"
            value={condition.key}
            onChange={(e) => onChange({ ...condition, key: e.target.value })}
            onPointerDown={stopPropagation}
            placeholder="예: visited_market"
            className={inputCls}
          />
        </label>
      )}

      {condition.kind === "minFlag" && (
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1 flex-1">
            <span className="text-gray-500 shrink-0">플래그</span>
            <input
              aria-label="minFlag key"
              value={condition.key}
              onChange={(e) => onChange({ ...condition, key: e.target.value })}
              onPointerDown={stopPropagation}
              placeholder="예: caughtCount"
              className={inputCls}
            />
          </label>
          <label className="flex items-center gap-1 w-32">
            <span className="text-gray-500 shrink-0">최소</span>
            <input
              aria-label="minFlag min"
              type="number"
              value={condition.min}
              onChange={(e) => onChange({ ...condition, min: Number(e.target.value) })}
              onPointerDown={stopPropagation}
              className={inputCls}
            />
          </label>
        </div>
      )}
    </div>
  );
}
