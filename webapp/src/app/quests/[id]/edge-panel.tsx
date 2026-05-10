"use client";

import type { Edge } from "@xyflow/react";
import type { AutoAdvance, QuestPhaseDef } from "@/types/quest";
import type { ItemDocument } from "@/types/item";
import { ConditionEditor } from "./condition-editor";

interface Props {
  edge: Edge;
  phases: Record<string, QuestPhaseDef>;
  items?: ItemDocument[];
  onUpdateAutoAdvance: (
    sourcePhaseId: string,
    index: number,
    updated: AutoAdvance
  ) => void;
  onDeleteEdge: (edgeId: string) => void;
}

export function EdgePanel({ edge, phases, items = [], onUpdateAutoAdvance, onDeleteEdge }: Props) {
  const edgeType = (edge.data as { edgeType?: string })?.edgeType ?? "on_interact";
  const sourcePhase = phases[edge.source];

  // auto_advance 엣지인 경우 조건 편집 가능
  const aaIndex =
    edgeType === "auto_advance"
      ? (edge.data as { aaIndex?: number })?.aaIndex ?? -1
      : -1;

  const aa =
    aaIndex >= 0 && sourcePhase ? sourcePhase.auto_advance[aaIndex] : null;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">연결 편집</h2>
        <button
          onClick={() => onDeleteEdge(edge.id)}
          className="px-2 py-0.5 text-xs rounded border border-red-300 text-red-500 hover:bg-red-50"
        >
          연결 삭제
        </button>
      </div>

      <div className="text-xs text-gray-500 space-y-0.5">
        <div>
          <span className="font-medium">출발:</span> {edge.source}
        </div>
        <div>
          <span className="font-medium">도착:</span> {edge.target}
        </div>
        <div>
          <span className="font-medium">타입:</span>{" "}
          <span
            className={
              edgeType === "auto_advance"
                ? "text-orange-500 font-mono"
                : "text-blue-500 font-mono"
            }
          >
            {edgeType}
          </span>
        </div>
      </div>

      {edgeType === "on_interact" && (
        <p className="text-xs text-gray-400 bg-blue-50 dark:bg-blue-950 rounded p-2">
          on_interact의 <code className="font-mono">AdvancePhase</code> 전환입니다.
          <br />
          조건 없이 플레이어 상호작용 시 실행됩니다.
          <br />
          조건을 추가하려면 출발 노드의 액션을 편집하세요.
        </p>
      )}

      {edgeType === "auto_advance" && aa && (
        <section>
          <label className="text-xs font-semibold text-gray-500 block mb-2">
            자동 전진 조건
          </label>
          <ConditionEditor
            condition={aa.condition}
            items={items}
            onChange={(c) =>
              onUpdateAutoAdvance(edge.source, aaIndex, {
                ...aa,
                condition: c,
              })
            }
          />
        </section>
      )}

      {edgeType === "branch" && (
        <p className="text-xs text-gray-400 bg-orange-50 dark:bg-orange-950 rounded p-2">
          Branch 분기 전환입니다.
          <br />
          분기 조건은 출발 노드의 Branch 액션에서 편집하세요.
        </p>
      )}
    </div>
  );
}
