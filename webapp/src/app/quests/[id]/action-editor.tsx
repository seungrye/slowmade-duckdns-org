"use client";

import type { Action, Condition } from "@/types/quest";
import { ConditionEditor } from "./condition-editor";

interface Props {
  actions: Action[];
  onChange: (actions: Action[]) => void;
  phaseIds: string[];
}

function emptyAction(type: Action["type"]): Action {
  switch (type) {
    case "AdvancePhase":     return { type, phaseId: "" };
    case "Log":              return { type, text: "" };
    case "GiveItem":         return { type, itemId: "" };
    case "RemoveItem":       return { type, itemId: "" };
    case "SetFlag":          return { type, flag: "", value: "" };
    case "KillNpc":          return { type, npcId: "" };
    case "DespawnWorldItem": return { type, itemId: "" };
    case "Branch":           return {
      type,
      condition: { type: "Always" } satisfies Condition,
      ifTrue: [],
      ifFalse: [],
    };
  }
}

// Use function declaration so ActionEditor (declared later) is accessible via hoisting
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
          <option value="Branch">Branch</option>
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
            className="flex-1 border rounded px-1 py-0.5 text-xs"
          />
          <input
            value={action.value}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            placeholder="value"
            className="flex-1 border rounded px-1 py-0.5 text-xs"
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
        <div className="space-y-2 pl-1 border-l-2 border-orange-300">
          <div className="text-[10px] font-semibold text-gray-500">조건</div>
          <ConditionEditor
            condition={action.condition}
            onChange={(c) => onChange({ ...action, condition: c })}
          />
          <div className="text-[10px] font-semibold text-gray-500">참일 때 (if_true)</div>
          <ActionEditor
            actions={action.ifTrue}
            onChange={(acts) => onChange({ ...action, ifTrue: acts })}
            phaseIds={phaseIds}
          />
          <div className="text-[10px] font-semibold text-gray-500">거짓일 때 (if_false)</div>
          <ActionEditor
            actions={action.ifFalse}
            onChange={(acts) => onChange({ ...action, ifFalse: acts })}
            phaseIds={phaseIds}
          />
        </div>
      )}
    </div>
  );
}

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
