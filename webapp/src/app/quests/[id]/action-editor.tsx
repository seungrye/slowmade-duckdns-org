"use client";

import type { Action, Condition } from "@/types/quest";
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
    case "RemoveItem":       return { type, itemId: "" };
    case "SetFlag":          return { type, flag: "", value: "" };
    case "KillNpc":          return { type, npcId: "" };
    case "DespawnWorldItem": return { type, itemId: "" };
    case "Branch":           return { type, condition: { type: "Always" }, ifTrue: [], ifFalse: [] };
  }
}

// ── ActionRow ─────────────────────────────────────────────────────────────────

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
          <option value="RemoveItem">RemoveItem</option>
          <option value="SetFlag">SetFlag</option>
          <option value="KillNpc">KillNpc</option>
          <option value="DespawnWorldItem">DespawnWorldItem</option>
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
          className="w-full border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800"
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
          className="w-full border rounded px-1 py-0.5 text-xs"
        />
      )}

      {action.type === "SetFlag" && (
        <div className="flex gap-1">
          <input
            value={action.flag}
            onChange={(e) => onChange({ ...action, flag: e.target.value })}
            placeholder="flag"
            className="flex-1 min-w-0 border rounded px-1 py-0.5 text-xs"
          />
          <input
            value={action.value}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            placeholder="value"
            className="flex-1 min-w-0 border rounded px-1 py-0.5 text-xs"
          />
        </div>
      )}

      {action.type === "KillNpc" && (
        <input
          value={action.npcId}
          onChange={(e) => onChange({ ...action, npcId: e.target.value })}
          placeholder="NPC ID"
          className="w-full border rounded px-1 py-0.5 text-xs"
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
