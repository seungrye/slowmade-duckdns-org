"use client";

import { memo } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import type { QuestPhaseDef } from "@/types/quest";

export type PhaseNodeData = {
  phaseId: string;
  phase: QuestPhaseDef;
  isInitial: boolean;
};

export const PhaseNode = memo(function PhaseNode({ data }: NodeProps) {
  const { phaseId, phase, isInitial } = data as PhaseNodeData;
  const objective = phase.objective;

  return (
    <div
      className={[
        "min-w-[160px] max-w-[220px] rounded-lg border-2 bg-white dark:bg-gray-900 shadow-md text-xs",
        isInitial ? "border-blue-500" : "border-gray-300 dark:border-gray-600",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      <div
        className={[
          "px-3 py-1.5 font-mono font-bold rounded-t-md text-white text-[11px]",
          isInitial ? "bg-blue-500" : "bg-gray-500 dark:bg-gray-700",
        ].join(" ")}
      >
        {phaseId}
        {isInitial && <span className="ml-1 text-[9px] opacity-80">(시작)</span>}
      </div>

      <div className="px-3 py-2 space-y-1">
        {objective && (
          <p className="text-gray-600 dark:text-gray-400 line-clamp-2 leading-tight">
            {objective}
          </p>
        )}
        {phase.dialog.length > 0 && (
          <p className="text-gray-400 dark:text-gray-500 italic truncate">
            &ldquo;{phase.dialog[0]}&rdquo;
          </p>
        )}
        <div className="flex gap-2 text-[10px] text-gray-400 pt-0.5">
          {phase.on_interact.length > 0 && (
            <span>액션 {phase.on_interact.length}</span>
          )}
          {phase.auto_advance.length > 0 && (
            <span>자동 {phase.auto_advance.length}</span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
});
