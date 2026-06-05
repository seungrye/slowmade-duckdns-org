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

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { GraphNodeData } from "@/lib/web-adventure/engine/graph";

type SceneNodeType = Node<GraphNodeData, "scene">;

const ENDING_ICON: Record<string, string> = {
  main: "🍪",
  spirit: "🌲",
  fail: "💀",
  shopkeeper: "🏪",
  goblin_friend: "👹",
  wizard_apprentice: "📚",
};

// endingId → tailwind 색 (배경 + 글씨).
const ENDING_COLOR: Record<string, string> = {
  main: "bg-amber-200 text-amber-900 border-amber-500",
  spirit: "bg-green-200 text-green-900 border-green-600",
  fail: "bg-gray-300 text-gray-700 border-gray-500",
  shopkeeper: "bg-blue-200 text-blue-900 border-blue-600",
  goblin_friend: "bg-purple-200 text-purple-900 border-purple-600",
  wizard_apprentice: "bg-indigo-300 text-indigo-900 border-indigo-700",
};

// ReactFlow 가 자동으로 selected/dragging 등을 NodeProps 로 전달.
// #234 — selected 시 노란 ring 으로 시각 피드백 (시작 노드의 isStart ring 과
// 색만 다름: 시작=amber-400, 선택=yellow-300 굵게 + offset).
type Props = NodeProps<SceneNodeType>;

export default function SceneNode({ id, data, selected }: Props) {
  const isEnding = data.isEnding === true;
  const isStart = data.isStart === true;
  const endingColor = data.endingId ? ENDING_COLOR[data.endingId] : "";
  const endingIcon = data.endingId ? ENDING_ICON[data.endingId] : "";

  const baseClass = isEnding
    ? `${endingColor} border-2`
    : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 border border-gray-400";
  // 우선순위: selected (노란) > isStart (보라 — selected 와 색 구분).
  // #235 사용자 피드백: 시작 노드의 amber-400 이 selected 의 yellow-300 과
  // 시각적으로 너무 비슷 → 시작 노드를 violet 으로 변경.
  const ringClass = selected
    ? "ring-4 ring-yellow-300 ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
    : isStart
      ? "ring-4 ring-violet-500"
      : "";

  return (
    <div
      data-graph-node-id={id}
      data-ending-id={data.endingId ?? undefined}
      data-saved-position={data.savedPosition ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      className={`${baseClass} ${ringClass} rounded-md px-3 py-2 w-[180px] h-[60px] text-xs shadow-sm cursor-grab active:cursor-grabbing flex flex-col justify-center transition-shadow`}
      title={`${id}\n${data.title}`}
    >
      <Handle type="target" position={Position.Top} />
      <div className="font-bold truncate flex items-center gap-1">
        {endingIcon && <span>{endingIcon}</span>}
        {isStart && <span>⭐</span>}
        <span className="truncate">{data.title}</span>
      </div>
      <div className="text-[10px] font-mono opacity-70 truncate">{id}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
