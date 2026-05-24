"use client";

import type { Action, PortalPlacement, TrapKind } from "@/types/quest";
import type { VillagerDocument } from "@/types/villager";
import type { ItemDocument } from "@/types/item";
import type { ZoneDocument } from "@/types/zone";
import { NpcCombobox } from "./npc-combobox";
import { ItemCombobox } from "./item-combobox";
import { ZoneCombobox } from "./zone-combobox";

interface Props {
  actions: Action[];
  onChange: (actions: Action[]) => void;
  villagers?: VillagerDocument[];
  items?: ItemDocument[];
  zones?: ZoneDocument[];
}

// ── 액션 타입 초기값 ──────────────────────────────────────────────────────────

function emptyAction(type: Action["type"]): Action {
  switch (type) {
    case "Log":              return { type, text: "" };
    case "GiveItem":         return { type, itemId: "" };
    case "GiveItems":        return { type, itemId: "", count: 1 };
    case "RemoveItem":       return { type, itemId: "" };
    case "SetFlag":          return { type, flag: "", value: "" };
    case "ClearFlag":        return { type, flag: "" };
    case "KillNpc":          return { type, npcId: "" };
    case "DespawnWorldItem": return { type, itemId: "" };
    case "OpenPortal":       return { type, zone: "", generator: "" };
    case "ClosePortal":      return { type, zone: "" };
    case "SpawnGuards":      return { type, count: 1 };
    case "PlaceTraps":       return { type, kind: "Spike", count: 1, hidden: true };
    case "Explode":          return { type, radius: 1, terrain: true, entityDamage: 0 };
    case "SpawnMonster":     return { type, monsterId: "", count: 1 };
  }
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

const inputCls = "w-full border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800";
const halfCls = "flex-1 min-w-0 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800";

// placement select 의 "(기본)" 옵션 — undefined 와 명시적 InsideRoom 구분
const PLACEMENT_DEFAULT = "__default__";
type PlacementSelectValue = typeof PLACEMENT_DEFAULT | PortalPlacement["type"];

function placementSelectValue(p?: PortalPlacement): PlacementSelectValue {
  return p ? p.type : PLACEMENT_DEFAULT;
}

function placementFromSelect(v: PlacementSelectValue, prev?: PortalPlacement): PortalPlacement | undefined {
  if (v === PLACEMENT_DEFAULT) return undefined;
  if (v === "NearGiver") {
    const radius = prev && prev.type === "NearGiver" ? prev.radius : 0;
    return { type: "NearGiver", radius };
  }
  return { type: v };
}

function ActionRow({
  action,
  onChange,
  onRemove,
  villagers,
  items,
  zones,
}: {
  action: Action;
  onChange: (a: Action) => void;
  onRemove: () => void;
  villagers: VillagerDocument[];
  items: ItemDocument[];
  zones: ZoneDocument[];
}) {
  return (
    <div className="border rounded p-2 space-y-1 bg-gray-50 dark:bg-gray-900">
      <div className="flex gap-1 items-center">
        <select
          value={action.type}
          onChange={(e) => onChange(emptyAction(e.target.value as Action["type"]))}
          className="flex-1 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
        >
          <option value="Log">Log</option>
          <option value="GiveItem">GiveItem</option>
          <option value="GiveItems">GiveItems (수량)</option>
          <option value="RemoveItem">RemoveItem</option>
          <option value="SetFlag">SetFlag</option>
          <option value="ClearFlag">ClearFlag</option>
          <option value="KillNpc">KillNpc</option>
          <option value="DespawnWorldItem">DespawnWorldItem</option>
          <option value="OpenPortal">OpenPortal (Named 존)</option>
          <option value="ClosePortal">ClosePortal</option>
          <option value="SpawnGuards">SpawnGuards (경비병 스폰)</option>
          <option value="PlaceTraps">PlaceTraps (함정 배치)</option>
          <option value="Explode">Explode (폭발)</option>
          <option value="SpawnMonster">SpawnMonster (몬스터 스폰)</option>
        </select>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-xs px-1">
          ✕
        </button>
      </div>

      {action.type === "Log" && (
        <textarea
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
          rows={2}
          placeholder="출력할 텍스트"
          className="w-full border rounded px-1 py-0.5 text-xs resize-none"
        />
      )}

      {(action.type === "GiveItem" || action.type === "RemoveItem" || action.type === "DespawnWorldItem") && (
        <ItemCombobox
          value={action.itemId}
          onChange={(v) => onChange({ ...action, itemId: v } as Action)}
          items={items}
          placeholder="아이템 id"
        />
      )}

      {action.type === "GiveItems" && (
        <div className="flex gap-1 items-start">
          <div className="flex-1 min-w-0">
            <ItemCombobox
              value={action.itemId}
              onChange={(v) => onChange({ ...action, itemId: v })}
              items={items}
              placeholder="아이템 id"
            />
          </div>
          <input
            type="number"
            min={1}
            value={action.count}
            onChange={(e) => onChange({ ...action, count: Number(e.target.value) })}
            placeholder="수량"
            className="w-20 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
          />
        </div>
      )}

      {action.type === "SetFlag" && (
        <div className="flex gap-1">
          <input
            value={action.flag}
            onChange={(e) => onChange({ ...action, flag: e.target.value })}
            placeholder="flag"
            className={halfCls}
          />
          <input
            value={action.value}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            placeholder="value"
            className={halfCls}
          />
        </div>
      )}

      {action.type === "ClearFlag" && (
        <input
          value={action.flag}
          onChange={(e) => onChange({ ...action, flag: e.target.value })}
          placeholder="flag 이름"
          className={inputCls}
        />
      )}

      {action.type === "KillNpc" && (
        <NpcCombobox
          value={action.npcId}
          onChange={(v) => onChange({ ...action, npcId: v })}
          villagers={villagers}
          placeholder="NPC id"
        />
      )}

      {action.type === "OpenPortal" && (
        <div className="space-y-1">
          <ZoneCombobox
            value={action.zone}
            onChange={(v) => {
              const matched = zones.find((z) => z.name === v);
              const next = { ...action, zone: v };
              // 카탈로그 매칭 + 현재 generator 비어있을 때만 자동 채움
              if (matched && !action.generator.trim()) next.generator = matched.generator;
              onChange(next);
            }}
            zones={zones}
            placeholder="존 ID (예: herb_glade)"
          />
          <input
            value={action.generator}
            onChange={(e) => onChange({ ...action, generator: e.target.value })}
            placeholder="생성기 (bsp / forest / cellular_automata 등)"
            className={inputCls}
          />
          <select
            value={placementSelectValue(action.placement)}
            onChange={(e) => {
              const next = placementFromSelect(e.target.value as PlacementSelectValue, action.placement);
              if (next === undefined) {
                onChange({ type: "OpenPortal", zone: action.zone, generator: action.generator });
              } else {
                onChange({ ...action, placement: next });
              }
            }}
            className={inputCls}
          >
            <option value={PLACEMENT_DEFAULT}>(기본 — InsideRoom, 직렬화 시 생략)</option>
            <option value="InsideRoom">InsideRoom</option>
            <option value="Border">Border</option>
            <option value="Random">Random</option>
            <option value="NearGiver">NearGiver (giver 반경)</option>
          </select>
          {action.placement?.type === "NearGiver" && (
            <input
              type="number"
              min={0}
              value={action.placement.radius}
              onChange={(e) => onChange({
                ...action,
                placement: { type: "NearGiver", radius: Number(e.target.value) },
              })}
              placeholder="radius"
              className={inputCls}
            />
          )}
        </div>
      )}

      {action.type === "ClosePortal" && (
        <input
          value={action.zone}
          onChange={(e) => onChange({ ...action, zone: e.target.value })}
          placeholder="존 ID"
          className={inputCls}
        />
      )}

      {action.type === "SpawnGuards" && (
        <input
          type="number"
          min={1}
          value={action.count}
          onChange={(e) => onChange({ ...action, count: Number(e.target.value) })}
          placeholder="경비병 수"
          className={inputCls}
        />
      )}

      {action.type === "PlaceTraps" && (
        <div className="space-y-1">
          <div className="flex gap-1 items-center">
            <select
              value={action.kind}
              onChange={(e) => onChange({ ...action, kind: e.target.value as TrapKind })}
              className={halfCls}
            >
              <option value="Spike">Spike</option>
              <option value="Poison">Poison</option>
              <option value="Alarm">Alarm</option>
              <option value="Teleport">Teleport</option>
            </select>
            <input
              type="number"
              min={1}
              value={action.count}
              onChange={(e) => onChange({ ...action, count: Number(e.target.value) })}
              placeholder="개수"
              className="w-20 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
            />
          </div>
          <label className="flex gap-1 items-center text-xs text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={action.hidden}
              onChange={(e) => onChange({ ...action, hidden: e.target.checked })}
            />
            hidden (숨김 함정)
          </label>
        </div>
      )}

      {action.type === "Explode" && (
        <div className="flex gap-1 items-center">
          <input
            type="number"
            value={action.radius}
            onChange={(e) => onChange({ ...action, radius: Number(e.target.value) })}
            placeholder="반경"
            className="w-20 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
          />
          <label className="flex gap-1 items-center text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
            <input
              type="checkbox"
              checked={action.terrain}
              onChange={(e) => onChange({ ...action, terrain: e.target.checked })}
            />
            지형 파괴
          </label>
          <input
            type="number"
            value={action.entityDamage}
            onChange={(e) => onChange({ ...action, entityDamage: Number(e.target.value) })}
            placeholder="피해"
            className="w-20 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
          />
        </div>
      )}

      {action.type === "SpawnMonster" && (
        <div className="flex gap-1 items-center">
          <input
            value={action.monsterId}
            onChange={(e) => onChange({ ...action, monsterId: e.target.value })}
            placeholder="몬스터 id (예: frost_wyrm)"
            className={halfCls}
          />
          <input
            type="number"
            min={1}
            value={action.count}
            onChange={(e) => onChange({ ...action, count: Number(e.target.value) })}
            placeholder="수량"
            className="w-20 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
          />
        </div>
      )}
    </div>
  );
}

// ── ActionEditor ──────────────────────────────────────────────────────────────

export function ActionEditor({ actions, onChange, villagers = [], items = [], zones = [] }: Props) {
  return (
    <div className="space-y-1">
      {actions.map((action, i) => (
        <ActionRow
          key={i}
          action={action}
          villagers={villagers}
          items={items}
          zones={zones}
          onChange={(a) => {
            const next = [...actions];
            next[i] = a;
            onChange(next);
          }}
          onRemove={() => onChange(actions.filter((_, j) => j !== i))}
        />
      ))}
      <button
        onClick={() => onChange([...actions, { type: "Log", text: "" }])}
        className="text-xs text-blue-500 hover:text-blue-700"
      >
        + 액션 추가
      </button>
    </div>
  );
}
