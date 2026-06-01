"use client";

import type { Edge } from "@xyflow/react";
import type { QuestTransition, Condition, TriggerKind } from "@/types/quest";
import type { VillagerDocument } from "@/types/villager";
import type { ItemDocument } from "@/types/item";
import type { ZoneDocument } from "@/types/zone";
import { ConditionEditor } from "./condition-editor";
import { ActionEditor } from "./action-editor";

interface Props {
  edge: Edge;
  transitions: QuestTransition[];
  phaseIds: string[];
  villagers?: VillagerDocument[];
  items?: ItemDocument[];
  zones?: ZoneDocument[];
  onUpdateTransition: (index: number, updated: QuestTransition) => void;
  onDeleteEdge: (edgeId: string) => void;
  /** 출발 phase 패널로 돌아가기 */
  onBack?: (phaseId: string) => void;
}

export function EdgePanel({
  edge,
  transitions,
  phaseIds,
  villagers = [],
  items = [],
  zones = [],
  onUpdateTransition,
  onDeleteEdge,
  onBack,
}: Props) {
  const idx = (edge.data as { transitionIndex?: number })?.transitionIndex ?? -1;
  const t = idx >= 0 ? transitions[idx] : undefined;

  if (!t) {
    return (
      <div className="h-full overflow-y-auto p-4 space-y-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">전환 편집</h2>
          <button
            onClick={() => onDeleteEdge(edge.id)}
            className="px-2 py-0.5 text-xs rounded border border-red-300 text-red-500 hover:bg-red-50"
          >
            연결 삭제
          </button>
        </div>
        <p className="text-xs text-gray-400">전환 정보를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const tx = t;
  const update = (patch: Partial<QuestTransition>) => onUpdateTransition(idx, { ...tx, ...patch });

  const selectCls = "w-full border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-800";

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 text-sm">
      {onBack && (
        <button
          onClick={() => onBack(tx.from)}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          ← <span className="font-mono">{tx.from}</span> 페이즈로
        </button>
      )}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">전환 편집</h2>
        <button
          onClick={() => onDeleteEdge(edge.id)}
          className="px-2 py-0.5 text-xs rounded border border-red-300 text-red-500 hover:bg-red-50"
        >
          연결 삭제
        </button>
      </div>

      {/* from / to */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">출발 (from)</label>
          <select value={tx.from} onChange={(e) => update({ from: e.target.value })} className={selectCls}>
            {phaseIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">도착 (to)</label>
          <select value={tx.to} onChange={(e) => update({ to: e.target.value })} className={selectCls}>
            {phaseIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      </div>

      {/* trigger */}
      <section>
        <label className="text-xs font-semibold text-gray-500 block mb-1">트리거</label>
        <select
          value={tx.trigger}
          onChange={(e) => update({ trigger: e.target.value as TriggerKind })}
          className={selectCls}
        >
          <option value="Interact">Interact — NPC 대화 후 상호작용</option>
          <option value="Auto">Auto — 매 프레임 조건 자동 평가</option>
          <option value="EnterNpcFov">EnterNpcFov — NPC 시야 진입</option>
          <option value="HoldingItemInNpcFov">HoldingItemInNpcFov — 시야 + 아이템 소지</option>
        </select>
        {tx.trigger === "Auto" && (
          <p className="text-[10px] text-gray-400 mt-1">
            Auto 의 액션은 DespawnWorldItem / RemoveItem / RemoveItems / SetFlag 만 허용됩니다.
          </p>
        )}
        {(tx.trigger === "EnterNpcFov" || tx.trigger === "HoldingItemInNpcFov") && (
          <div className="mt-2 space-y-1">
            <input
              type="text"
              placeholder="NPC id (예: market_owner)"
              value={tx.triggerNpcId ?? ""}
              onChange={(e) => update({ triggerNpcId: e.target.value })}
              className={selectCls}
            />
            {tx.trigger === "HoldingItemInNpcFov" && (
              <input
                type="text"
                placeholder="아이템 id (예: super_tintham_cracker)"
                value={tx.triggerItemId ?? ""}
                onChange={(e) => update({ triggerItemId: e.target.value })}
                className={selectCls}
              />
            )}
            <p className="text-[10px] text-gray-400">
              FOV 트리거의 액션은 DespawnWorldItem / RemoveItem / RemoveItems / SetFlag / ClearFlag / Log / TeleportToNpcHome 만 허용됩니다.
            </p>
          </div>
        )}
      </section>

      {/* when 조건 */}
      <section>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-semibold text-gray-500">조건 (when)</label>
          {tx.when === undefined ? (
            <button
              onClick={() => update({ when: { type: "Always" } as Condition })}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              + 조건 추가
            </button>
          ) : (
            <button
              onClick={() => update({ when: undefined })}
              className="text-xs text-red-400 hover:text-red-600"
            >
              조건 제거
            </button>
          )}
        </div>
        {tx.when === undefined ? (
          <p className="text-[10px] text-gray-400">조건 없음 — 항상 매칭 (unconditional)</p>
        ) : (
          <ConditionEditor
            condition={tx.when}
            items={items}
            zones={zones}
            onChange={(c) => update({ when: c })}
          />
        )}
      </section>

      {/* actions */}
      <section>
        <label className="text-xs font-semibold text-gray-500 block mb-1">액션 (actions)</label>
        <ActionEditor
          actions={tx.actions}
          villagers={villagers}
          items={items}
          zones={zones}
          onChange={(actions) => update({ actions })}
        />
      </section>
    </div>
  );
}
