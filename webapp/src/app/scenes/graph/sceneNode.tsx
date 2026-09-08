// SceneNode - the ReactFlow custom node component.
//
// #222 - the /scenes/graph chart.
//
// The design:
//   - the starting scene (town_square_dawn) - a thick yellow border.
//   - an ending scene - its own colour per endingId.
//   - an ordinary scene - a grey background with dark text.
//
// The data-* attributes (for the tests and outside querySelectors):
//   - data-graph-node-id  the scene id
//   - data-ending-id      the endingId (where there is one)
//   - data-saved-position true/false (whether mongo holds a position)

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { GraphNodeData } from "@/lib/web-adventure/engine/graph";
import { endingsMeta } from "@/content/web-adventure/endings";

type SceneNodeType = Node<GraphNodeData, "scene">;

// #335 - every ending is a single colour (amber). The 6 endingIds are told apart by *icon* alone.
// Graph legibility: a 6-colour mapping per kind was visual noise -> only the ordinary-node vs ending-node
// distinction is kept. The legend's 6 ending lines are gone too (individual colours meant nothing).
const ENDING_COLOR_SINGLE = "bg-amber-200 text-amber-900 border-amber-500";

// ReactFlow passes selected, dragging and so on as NodeProps automatically.
// #234 - a yellow ring gives visual feedback when selected (differing from the starting node's isStart ring
// in colour alone: start = amber-400, selected = a thick yellow-300 with an offset).
type Props = NodeProps<SceneNodeType>;

// #347 - React.memo: blocking the cost of re-rendering 69 nodes on every ReactFlow render.
// It renders only when the props (id/data/selected/dragging and so on) change.
function SceneNodeInner({ id, data, selected }: Props) {
  const isEnding = data.isEnding === true;
  const isStart = data.isStart === true;
  // endingsMeta is the single source - a change in endings.ts is reflected automatically.
  const endingIcon =
    data.endingId && data.endingId in endingsMeta
      ? endingsMeta[data.endingId as keyof typeof endingsMeta].icon
      : "";

  // #335 - an ending node is a *single colour* (amber). The per-endingId colour mapping is gone.
  const baseClass = isEnding
    ? `${ENDING_COLOR_SINGLE} border-2`
    : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 border border-gray-400";
  // The priority: selected (a yellow glow) > isStart (a violet ring - told apart by colour).
  // #235 - the starting node is violet (distinct from amber).
  // #337 - the selected node: a ring becomes *a yellow glow* (box-shadow). The same visual language as
  // the connected edges' yellow drop-shadow glow (#334).
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
      // #347/will-change - isolating the transform updates of a drag or zoom onto a GPU compositing layer.
      //   The browser hint cuts the painting cost -> better node-drag responsiveness.
      style={{ willChange: "transform", ...glowStyle }}
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
