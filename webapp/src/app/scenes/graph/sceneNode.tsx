// SceneNode — ReactFlow 커스텀 노드 컴포넌트.
//
// #222 — /scenes/graph 차트.
//
// 디자인:
//   - 시작 씬 (town_square_dawn) — 노란색 굵은 테두리.
//   - 엔딩 씬 — endingId 별 독립 색상.
//   - 일반 씬 — 회색 배경 + 어두운 글씨.
//
// data-* 속성 (테스트 + 외부 querySelector 용):
//   - data-graph-node-id  씬 id
//   - data-ending-id      endingId (있는 경우)
//   - data-saved-position true/false (mongo position 저장 여부)

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { GraphNodeData } from "@/lib/web-adventure/engine/graph";
import { endingsMeta } from "@/content/web-adventure/endings";

type SceneNodeType = Node<GraphNodeData, "scene">;

// #335 — 모든 엔딩 단일 색 (amber). 6 endingId 차이는 *icon* 으로만 구분.
// 그래프 시인성: 종류별 6 색 매핑이 시각 노이즈 → 일반 노드 vs 엔딩 노드 구분
// 만 유지. 범례의 6 엔딩 라인도 제거 (개별 색 의미 없음).
const ENDING_COLOR_SINGLE = "bg-amber-200 text-amber-900 border-amber-500";

// ReactFlow 가 자동으로 selected/dragging 등을 NodeProps 로 전달.
// #234 — selected 시 노란 ring 으로 시각 피드백 (시작 노드의 isStart ring 과
// 색만 다름: 시작=amber-400, 선택=yellow-300 굵게 + offset).
type Props = NodeProps<SceneNodeType>;

// #347 — React.memo: 69 노드 × 매 ReactFlow render 마다 re-render 부담 차단.
// props (id/data/selected/dragging 등) 변화 시만 렌더.
function SceneNodeInner({ id, data, selected }: Props) {
  const isEnding = data.isEnding === true;
  const isStart = data.isStart === true;
  // endingsMeta 단일 소스 — endings.ts 변경 시 자동 반영.
  const endingIcon =
    data.endingId && data.endingId in endingsMeta
      ? endingsMeta[data.endingId as keyof typeof endingsMeta].icon
      : "";

  // #335 — 엔딩 노드는 *단일 색* (amber). endingId 별 색 매핑 제거.
  const baseClass = isEnding
    ? `${ENDING_COLOR_SINGLE} border-2`
    : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 border border-gray-400";
  // 우선순위: selected (노란 glow) > isStart (보라 ring — 색 구분).
  // #235 — 시작 노드 violet (amber 와 차별).
  // #337 — 선택 노드: ring → *노란 glow* (box-shadow). 연결 엣지의 노란
  // drop-shadow glow (#334) 와 일관된 시각 언어.
  const ringClass = !selected && isStart ? "ring-4 ring-violet-500" : "";
  const glowStyle = selected
    ? { boxShadow: "0 0 8px #fde047, 0 0 16px #fde047" }
    : undefined;

  return (
    <div
      data-graph-node-id={id}
      data-ending-id={data.endingId ?? undefined}
      data-saved-position={data.savedPosition ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      className={`${baseClass} ${ringClass} rounded-md px-3 py-2 w-[180px] h-[60px] text-xs ${selected ? "" : "shadow-sm"} cursor-grab active:cursor-grabbing flex flex-col justify-center transition-shadow`}
      title={`${id}\n${data.title}`}
      style={glowStyle}
    >
      <Handle type="target" position={Position.Left} />
      <div className="font-bold truncate flex items-center gap-1">
        {endingIcon && <span>{endingIcon}</span>}
        {isStart && <span>⭐</span>}
        <span className="truncate">{data.title}</span>
      </div>
      <div className="text-[10px] font-mono opacity-70 truncate">{id}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const SceneNode = memo(SceneNodeInner);
export default SceneNode;
