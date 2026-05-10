"use client";

import type { Action, Condition, PortalPlacement } from "@/types/quest";
import { ConditionEditor } from "./condition-editor";

interface Props {
  actions: Action[];
  onChange: (actions: Action[]) => void;
  phaseIds: string[];
}

// ── Branch 체인 flatten / unflatten ─────────────────────────────────────────

type BranchCase = { condition: Condition; ifTrue: Action[] };
type FlatBranch = { cases: BranchCase[]; defaultActions: Action[] };

function flattenBranch(action: Extract<Action, { type: "Branch" }>): FlatBranch {
  const cases: BranchCase[] = [];
  let cur: Action = action;
  while (cur.type === "Branch") {
    cases.push({ condition: cur.condition, ifTrue: cur.ifTrue });
    if (cur.ifFalse.length === 1 && cur.ifFalse[0].type === "Branch") {
      cur = cur.ifFalse[0];
    } else {
      return { cases, defaultActions: cur.ifFalse };
    }
  }
  return { cases, defaultActions: [] };
}

function unflattenBranch(flat: FlatBranch): Extract<Action, { type: "Branch" }> {
  let ifFalse: Action[] = flat.defaultActions;
  for (let i = flat.cases.length - 1; i >= 0; i--) {
    ifFalse = [{ type: "Branch", condition: flat.cases[i].condition, ifTrue: flat.cases[i].ifTrue, ifFalse }];
  }
  return ifFalse[0] as Extract<Action, { type: "Branch" }>;
}

// ── Switch/Case 에디터 ────────────────────────────────────────────────────────

function SwitchCaseEditor({
  action,
  onChange,
  phaseIds,
}: {
  action: Extract<Action, { type: "Branch" }>;
  onChange: (a: Action) => void;
  phaseIds: string[];
}) {
  const flat = flattenBranch(action);

  function update(next: FlatBranch) {
    if (next.cases.length === 0) {
      // 케이스가 없으면 Branch 자체를 제거할 수 없으므로 최소 1개 유지
      onChange(unflattenBranch({ cases: [{ condition: { type: "Always" }, ifTrue: [] }], defaultActions: next.defaultActions }));
    } else {
      onChange(unflattenBranch(next));
    }
  }

  return (
    <div className="space-y-2 pl-1 border-l-2 border-orange-300">
      {flat.cases.map((c, i) => (
        <div key={i} className="space-y-1 bg-orange-50 dark:bg-orange-950/20 rounded p-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-orange-500">case {i + 1}</span>
            <button
              onClick={() => update({ ...flat, cases: flat.cases.filter((_, j) => j !== i) })}
              className="text-red-400 hover:text-red-600 text-[10px]"
            >
              ✕ 제거
            </button>
          </div>
          <ConditionEditor
            condition={c.condition}
            onChange={(cond) => {
              const cases = [...flat.cases];
              cases[i] = { ...c, condition: cond };
              update({ ...flat, cases });
            }}
          />
          <div className="text-[10px] text-gray-400">→ 실행</div>
          <ActionEditor
            actions={c.ifTrue}
            onChange={(acts) => {
              const cases = [...flat.cases];
              cases[i] = { ...c, ifTrue: acts };
              update({ ...flat, cases });
            }}
            phaseIds={phaseIds}
          />
        </div>
      ))}

      <div className="space-y-1 bg-gray-100 dark:bg-gray-800/50 rounded p-1.5">
        <span className="text-[10px] font-bold text-gray-500">default</span>
        <ActionEditor
          actions={flat.defaultActions}
          onChange={(acts) => update({ ...flat, defaultActions: acts })}
          phaseIds={phaseIds}
        />
      </div>

      <button
        onClick={() => update({ ...flat, cases: [...flat.cases, { condition: { type: "Always" }, ifTrue: [] }] })}
        className="text-[10px] text-orange-500 hover:text-orange-700"
      >
        + 케이스 추가
      </button>
    </div>
  );
}

// ── 액션 타입 초기값 ──────────────────────────────────────────────────────────

function emptyAction(type: Action["type"]): Action {
  switch (type) {
    case "AdvancePhase":     return { type, phaseId: "" };
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
    case "Branch":           return { type, condition: { type: "Always" }, ifTrue: [], ifFalse: [] };
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
  phaseIds,
}: {
  action: Action;
  onChange: (a: Action) => void;
  onRemove: () => void;
  phaseIds: string[];
}) {
  return (
    <div className="border rounded p-2 space-y-1 bg-gray-50 dark:bg-gray-900">
      <div className="flex gap-1 items-center">
        <select
          value={action.type}
          onChange={(e) => onChange(emptyAction(e.target.value as Action["type"]))}
          className="flex-1 border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
        >
          <option value="AdvancePhase">AdvancePhase</option>
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
          <option value="Branch">Branch (switch)</option>
        </select>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-xs px-1">
          ✕
        </button>
      </div>

      {action.type === "AdvancePhase" && (
        <select
          value={action.phaseId}
          onChange={(e) => onChange({ ...action, phaseId: e.target.value })}
          className={inputCls}
        >
          <option value="">페이즈 선택</option>
          {phaseIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      )}

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
        <input
          value={action.itemId}
          onChange={(e) => onChange({ ...action, itemId: e.target.value } as Action)}
          placeholder="아이템 ID"
          className={inputCls}
        />
      )}

      {action.type === "GiveItems" && (
        <div className="flex gap-1">
          <input
            value={action.itemId}
            onChange={(e) => onChange({ ...action, itemId: e.target.value })}
            placeholder="아이템 ID"
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
        <input
          value={action.npcId}
          onChange={(e) => onChange({ ...action, npcId: e.target.value })}
          placeholder="NPC ID"
          className={inputCls}
        />
      )}

      {action.type === "OpenPortal" && (
        <div className="space-y-1">
          <input
            value={action.zone}
            onChange={(e) => onChange({ ...action, zone: e.target.value })}
            placeholder="존 ID (예: herb_glade)"
            className={inputCls}
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

      {action.type === "Branch" && (
        <SwitchCaseEditor
          action={action}
          onChange={onChange}
          phaseIds={phaseIds}
        />
      )}
    </div>
  );
}

// ── ActionEditor ──────────────────────────────────────────────────────────────

export function ActionEditor({ actions, onChange, phaseIds }: Props) {
  return (
    <div className="space-y-1">
      {actions.map((action, i) => (
        <ActionRow
          key={i}
          action={action}
          phaseIds={phaseIds}
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
