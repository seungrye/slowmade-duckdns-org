"use client";

import type { Action, PortalPlacement, TrapKind } from "@/types/quest";
import type { VillagerDocument, HomeLandmark } from "@/types/villager";
import { HOME_LANDMARKS, HOME_LANDMARK_LABEL } from "@/types/villager";
import type { ItemDocument } from "@/types/item";
import type { ZoneDocument } from "@/types/zone";
import { NpcCombobox } from "./npc-combobox";
import { ItemCombobox } from "./item-combobox";
import { ZoneCombobox } from "./zone-combobox";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Props {
  actions: Action[];
  onChange: (actions: Action[]) => void;
  villagers?: VillagerDocument[];
  items?: ItemDocument[];
  zones?: ZoneDocument[];
}

// ── 순서 재배치 헬퍼 (단위 테스트용 export) ──────────────────────────────────
export function reorderActions<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  return arrayMove(items, from, to);
}

// ── 액션 타입 초기값 ──────────────────────────────────────────────────────────

function emptyAction(type: Action["type"]): Action {
  switch (type) {
    case "Log":               return { type, text: "" };
    case "GiveItem":          return { type, itemId: "" };
    case "GiveItems":         return { type, itemId: "", count: 1 };
    case "RemoveItem":        return { type, itemId: "" };
    case "RemoveItems":       return { type, itemId: "", count: 1 };
    case "TeleportToNpcHome": return { type, npcId: "" };
    case "SetFlag":           return { type, flag: "", value: "" };
    case "ClearFlag":         return { type, flag: "" };
    case "KillNpc":           return { type, npcId: "" };
    case "DespawnWorldItem":  return { type, itemId: "" };
    case "OpenPortal":        return { type, zone: "", generator: "" };
    case "OpenZonePortal":    return { type, target: { type: "Named", id: "mountain_village" } };
    case "ClosePortal":       return { type, zone: "" };
    case "SpawnGuards":       return { type, count: 1 };
    case "PlaceTraps":        return { type, kind: "Spike", count: 1, hidden: true };
    case "Explode":           return { type, radius: 1, terrain: true, entityDamage: 0 };
    case "SpawnMonster":      return { type, monsterId: "", count: 1 };
    case "SpawnItem":         return { type, itemId: "" };
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
          <option value="RemoveItems">RemoveItems (수량)</option>
          <option value="TeleportToNpcHome">TeleportToNpcHome (NPC 집으로)</option>
          <option value="SetFlag">SetFlag</option>
          <option value="ClearFlag">ClearFlag</option>
          <option value="KillNpc">KillNpc</option>
          <option value="DespawnWorldItem">DespawnWorldItem</option>
          <option value="OpenPortal">OpenPortal (Named 존 + generator)</option>
          <option value="OpenZonePortal">OpenZonePortal (Town/Named zone)</option>
          <option value="ClosePortal">ClosePortal</option>
          <option value="SpawnGuards">SpawnGuards (경비병 스폰)</option>
          <option value="PlaceTraps">PlaceTraps (함정 배치)</option>
          <option value="Explode">Explode (폭발)</option>
          <option value="SpawnMonster">SpawnMonster (몬스터 스폰)</option>
          <option value="SpawnItem">SpawnItem (런타임 아이템 스폰)</option>
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

      {action.type === "RemoveItems" && (
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
            value={action.count ?? 1}
            onChange={(e) => onChange({ ...action, count: Number(e.target.value) })}
            placeholder="수량"
            className="w-20 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
          />
        </div>
      )}

      {action.type === "TeleportToNpcHome" && (
        <NpcCombobox
          value={action.npcId}
          onChange={(v) => onChange({ ...action, npcId: v })}
          villagers={villagers}
          placeholder="NPC id (그 NPC 의 home_landmark 위치로 텔레포트)"
        />
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

      {action.type === "OpenZonePortal" && (
        <div className="space-y-1">
          {/*
            target select — Town 만 정적, 나머지는 Named(id) 로 통일된 schema.
            표준 Named id (mountain_village/seaside_harbor/forest/dungeon_<N>) 와
            카탈로그의 동적 zone 을 모두 ZoneCombobox 가 자동완성한다.
          */}
          <select
            aria-label="target zone"
            value={action.target.type}
            onChange={(e) => {
              const t = e.target.value;
              if (t === "Town") onChange({ ...action, target: { type: "Town" } });
              else onChange({ ...action, target: { type: "Named", id: "mountain_village" } });
            }}
            className={inputCls}
          >
            <option value="Town">Town (시작 마을)</option>
            <option value="Named">Named (id 로 모든 zone)</option>
          </select>
          {action.target.type === "Named" && (
            <ZoneCombobox
              value={action.target.id}
              onChange={(v) => onChange({ ...action, target: { type: "Named", id: v } })}
              zones={zones}
              placeholder="Named id (예: mountain_village, forest, herb_glade)"
            />
          )}
          <select
            value={placementSelectValue(action.placement)}
            onChange={(e) => {
              const next = placementFromSelect(e.target.value as PlacementSelectValue, action.placement);
              if (next === undefined) {
                onChange({ type: "OpenZonePortal", target: action.target });
              } else {
                onChange({ ...action, placement: next });
              }
            }}
            className={inputCls}
          >
            <option value={PLACEMENT_DEFAULT}>(기본 — Border, 직렬화 시 생략)</option>
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

      {action.type === "SpawnItem" && (
        <div className="space-y-1">
          <ItemCombobox
            value={action.itemId}
            onChange={(v) => onChange({ ...action, itemId: v })}
            items={items}
            placeholder="아이템 id"
          />
          {/* zone — undefined(현재 zone) / Town / Named */}
          <select
            aria-label="spawn zone"
            value={action.zone?.type ?? "__current__"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__current__") {
                const { zone: _zone, ...rest } = action;
                void _zone;
                onChange(rest);
              } else if (v === "Town") {
                onChange({ ...action, zone: { type: "Town" } });
              } else {
                onChange({ ...action, zone: { type: "Named", id: "mountain_village" } });
              }
            }}
            className={inputCls}
          >
            <option value="__current__">(현재 zone — 기본)</option>
            <option value="Town">Town (시작 마을)</option>
            <option value="Named">Named (id 지정)</option>
          </select>
          {action.zone?.type === "Named" && (
            <ZoneCombobox
              value={action.zone.id}
              onChange={(v) => onChange({ ...action, zone: { type: "Named", id: v } })}
              zones={zones}
              placeholder="Named id (예: mountain_village, herb_glade)"
            />
          )}
          {/* landmark — Town zone 한정 (undefined 시 zone 임의 floor) */}
          <select
            aria-label="spawn landmark"
            value={action.landmark ?? "__none__"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__none__") {
                const { landmark: _lm, ...rest } = action;
                void _lm;
                onChange(rest);
              } else {
                onChange({ ...action, landmark: v as HomeLandmark });
              }
            }}
            className={inputCls}
          >
            <option value="__none__">(landmark 없음 — zone 임의 floor)</option>
            {HOME_LANDMARKS.map((lm) => (
              <option key={lm} value={lm}>{HOME_LANDMARK_LABEL[lm]}</option>
            ))}
          </select>
          <div className="flex gap-1 items-start">
            <input
              type="number"
              min={0}
              value={action.vendorDistanceMin ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  const { vendorDistanceMin: _v, ...rest } = action;
                  void _v;
                  onChange(rest);
                } else {
                  onChange({ ...action, vendorDistanceMin: Number(raw) });
                }
              }}
              placeholder="vendor 최소거리 (manhattan, 비우면 무제한)"
              className={halfCls}
            />
            <input
              type="number"
              min={1}
              value={action.count ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  const { count: _c, ...rest } = action;
                  void _c;
                  onChange(rest);
                } else {
                  onChange({ ...action, count: Number(raw) });
                }
              }}
              placeholder="수량 (기본 1)"
              className="w-20 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── SortableActionRow — ActionRow 를 dnd-kit useSortable 로 감싸는 wrapper ───

function SortableActionRow({
  id,
  action,
  onChange,
  onRemove,
  villagers,
  items,
  zones,
}: {
  id: string;
  action: Action;
  onChange: (a: Action) => void;
  onRemove: () => void;
  villagers: VillagerDocument[];
  items: ItemDocument[];
  zones: ZoneDocument[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex gap-1 items-stretch">
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="드래그로 순서 변경"
        className="cursor-grab text-zinc-400 hover:text-zinc-200 px-1 select-none touch-none flex items-center text-xs"
      >
        ⋮⋮
      </button>
      <div className="flex-1 min-w-0">
        <ActionRow
          action={action}
          onChange={onChange}
          onRemove={onRemove}
          villagers={villagers}
          items={items}
          zones={zones}
        />
      </div>
    </div>
  );
}

// ── ActionEditor ──────────────────────────────────────────────────────────────

export function ActionEditor({ actions, onChange, villagers = [], items = [], zones = [] }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 각 action 에 안정적인 id — index 기반 (배열 reorder 시 변하지만 dnd-kit 충분)
  const ids = actions.map((_, i) => `action-${i}`);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) {
      onChange(reorderActions(actions, from, to));
    }
  }

  return (
    <div className="space-y-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {actions.map((action, i) => (
            <SortableActionRow
              key={ids[i]}
              id={ids[i]}
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
        </SortableContext>
      </DndContext>
      <button
        onClick={() => onChange([...actions, { type: "Log", text: "" }])}
        className="text-xs text-blue-500 hover:text-blue-700"
      >
        + 액션 추가
      </button>
    </div>
  );
}
