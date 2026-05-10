"use client";

import type { Condition, SpawnZone } from "@/types/quest";
import type { ItemDocument } from "@/types/item";
import type { ZoneDocument } from "@/types/zone";
import { ItemCombobox } from "./item-combobox";
import { ZoneCombobox } from "./zone-combobox";

interface Props {
  condition: Condition;
  onChange: (c: Condition) => void;
  items?: ItemDocument[];
  zones?: ZoneDocument[];
}

function emptyCondition(type: Condition["type"]): Condition {
  switch (type) {
    case "Always":  return { type: "Always" };
    case "FlagIs":  return { type: "FlagIs", flag: "", value: "" };
    case "HasFlag": return { type: "HasFlag", flag: "" };
    case "HasItem": return { type: "HasItem", itemId: "" };
    case "And":     return { type: "And", conditions: [] };
    case "Or":      return { type: "Or", conditions: [] };
    case "Not":     return { type: "Not", condition: { type: "Always" } };
    case "PhaseIs": return { type: "PhaseIs", quest: "", phase: "" };
    case "InZone":  return { type: "InZone", zone: { type: "Forest" } };
  }
}

const inputCls = "flex-1 min-w-0 border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800";
const selectCls = "w-full border rounded px-2 py-1 text-xs bg-white dark:bg-gray-800";

export function ConditionEditor({ condition, onChange, items = [], zones = [] }: Props) {
  const type = condition?.type ?? "Always";

  return (
    <div className="space-y-1">
      {/* 타입 선택 */}
      <select
        value={type}
        onChange={(e) => onChange(emptyCondition(e.target.value as Condition["type"]))}
        className={selectCls}
      >
        <option value="Always">Always (무조건)</option>
        <option value="FlagIs">FlagIs (플래그 값 비교)</option>
        <option value="HasFlag">HasFlag (플래그 존재)</option>
        <option value="HasItem">HasItem (아이템 보유)</option>
        <option value="And">And (모두 참)</option>
        <option value="Or">Or (하나 이상 참)</option>
        <option value="Not">Not (부정)</option>
        <option value="PhaseIs">PhaseIs (퀘스트 페이즈 확인)</option>
        <option value="InZone">InZone (존 내)</option>
      </select>

      {/* FlagIs */}
      {condition.type === "FlagIs" && (
        <div className="flex gap-1 items-center">
          <input
            value={condition.flag}
            onChange={(e) => onChange({ ...condition, flag: e.target.value })}
            placeholder="flag 이름"
            className={inputCls}
          />
          <span className="text-xs text-gray-400">=</span>
          <input
            value={condition.value}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            placeholder="값"
            className={inputCls}
          />
        </div>
      )}

      {/* HasFlag */}
      {condition.type === "HasFlag" && (
        <input
          value={condition.flag}
          onChange={(e) => onChange({ ...condition, flag: e.target.value })}
          placeholder="flag 이름"
          className={selectCls}
        />
      )}

      {/* HasItem */}
      {condition.type === "HasItem" && (
        <ItemCombobox
          value={condition.itemId}
          onChange={(v) => onChange({ ...condition, itemId: v })}
          items={items}
          placeholder="아이템 id"
        />
      )}

      {/* And / Or — 서브 조건 목록 */}
      {(condition.type === "And" || condition.type === "Or") && (
        <div className="pl-2 border-l-2 border-blue-200 space-y-1">
          {condition.conditions.map((sub, i) => (
            <div key={i} className="flex gap-1 items-start">
              <div className="flex-1 min-w-0">
                <ConditionEditor
                  condition={sub}
                  items={items}
                  zones={zones}
                  onChange={(updated) => {
                    const next = [...condition.conditions];
                    next[i] = updated;
                    onChange({ ...condition, conditions: next });
                  }}
                />
              </div>
              <button
                onClick={() => onChange({ ...condition, conditions: condition.conditions.filter((_, j) => j !== i) })}
                className="text-red-400 hover:text-red-600 text-xs px-1 mt-1 shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => onChange({ ...condition, conditions: [...condition.conditions, { type: "Always" }] })}
            className="text-[10px] text-blue-500 hover:text-blue-700"
          >
            + 조건 추가
          </button>
        </div>
      )}

      {/* Not — 서브 조건 단일 */}
      {condition.type === "Not" && (
        <div className="pl-2 border-l-2 border-purple-200">
          <ConditionEditor
            condition={condition.condition}
            items={items}
            zones={zones}
            onChange={(updated) => onChange({ ...condition, condition: updated })}
          />
        </div>
      )}

      {/* PhaseIs */}
      {condition.type === "PhaseIs" && (
        <div className="flex gap-1">
          <input
            value={condition.quest}
            onChange={(e) => onChange({ ...condition, quest: e.target.value })}
            placeholder="퀘스트 ID"
            className={inputCls}
          />
          <input
            value={condition.phase}
            onChange={(e) => onChange({ ...condition, phase: e.target.value })}
            placeholder="페이즈 ID"
            className={inputCls}
          />
        </div>
      )}

      {/* InZone */}
      {condition.type === "InZone" && (
        <div className="space-y-1">
          <select
            value={condition.zone.type}
            onChange={(e) => {
              const zoneType = e.target.value as SpawnZone["type"];
              const zone: SpawnZone =
                zoneType === "Dungeon" ? { type: "Dungeon", level: 1 }
                : zoneType === "Named" ? { type: "Named", id: "" }
                : zoneType === "Town" ? { type: "Town" }
                : { type: "Forest" };
              onChange({ ...condition, zone });
            }}
            className={selectCls}
          >
            <option value="Town">Town</option>
            <option value="Forest">Forest</option>
            <option value="Dungeon">Dungeon</option>
            <option value="Named">Named (퀘스트 동적 존)</option>
          </select>
          {condition.zone.type === "Dungeon" && (
            <input
              type="number"
              value={condition.zone.level}
              onChange={(e) => onChange({ ...condition, zone: { type: "Dungeon", level: Number(e.target.value) } })}
              placeholder="레벨"
              className={selectCls}
            />
          )}
          {condition.zone.type === "Named" && (
            <ZoneCombobox
              value={condition.zone.id}
              onChange={(v) => onChange({ ...condition, zone: { type: "Named", id: v } })}
              zones={zones}
              placeholder="존 ID (예: herb_glade)"
            />
          )}
        </div>
      )}
    </div>
  );
}
