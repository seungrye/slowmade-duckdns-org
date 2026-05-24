"use client";

import type { QuestPhaseDef } from "@/types/quest";
import type { VillagerDocument } from "@/types/villager";
import { NpcCombobox } from "./npc-combobox";

interface Props {
  phaseId: string;
  phase: QuestPhaseDef;
  isInitial: boolean;
  giverNpc: string;
  villagers?: VillagerDocument[];
  onUpdate: (phase: QuestPhaseDef) => void;
  onUpdateGiverNpc: (v: string) => void;
  onDelete: () => void;
  onSetInitial: () => void;
}

export function PhasePanel({
  phaseId,
  phase,
  isInitial,
  giverNpc,
  villagers = [],
  onUpdate,
  onUpdateGiverNpc,
  onDelete,
  onSetInitial,
}: Props) {
  function setDialog(lines: string[]) { onUpdate({ ...phase, dialog: lines }); }
  function setObjective(v: string) { onUpdate({ ...phase, objective: v || null }); }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 text-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono font-bold text-base">{phaseId}</h2>
          {isInitial && <span className="text-xs text-blue-500">시작 페이즈</span>}
        </div>
        <div className="flex gap-1">
          {!isInitial && (
            <button
              onClick={onSetInitial}
              className="px-2 py-0.5 text-xs rounded border hover:border-blue-400 hover:text-blue-500"
            >
              시작으로 설정
            </button>
          )}
          <button
            onClick={onDelete}
            className="px-2 py-0.5 text-xs rounded border border-red-300 text-red-500 hover:bg-red-50"
          >
            삭제
          </button>
        </div>
      </div>

      {/* Giver NPC (시작 페이즈에만 표시) */}
      {isInitial && (
        <section>
          <label className="text-xs font-semibold text-gray-500 block mb-1">Giver NPC</label>
          <NpcCombobox
            value={giverNpc}
            onChange={onUpdateGiverNpc}
            villagers={villagers}
            placeholder="NPC 이름 (예: 장로)"
          />
        </section>
      )}

      {/* Objective */}
      <section>
        <label className="text-xs font-semibold text-gray-500 block mb-1">목표 텍스트</label>
        <textarea
          value={phase.objective ?? ""}
          onChange={(e) => setObjective(e.target.value)}
          rows={2}
          placeholder="(없음)"
          className="w-full border rounded px-2 py-1 text-xs resize-none"
        />
      </section>

      {/* Dialog */}
      <section>
        <label className="text-xs font-semibold text-gray-500 block mb-1">대사 목록</label>
        <div className="space-y-1">
          {phase.dialog.map((line, i) => (
            <div key={i} className="flex gap-1">
              <textarea
                value={line}
                onChange={(e) => {
                  const next = [...phase.dialog];
                  next[i] = e.target.value;
                  setDialog(next);
                }}
                rows={2}
                className="flex-1 border rounded px-2 py-1 text-xs resize-none"
              />
              <button
                onClick={() => setDialog(phase.dialog.filter((_, j) => j !== i))}
                className="text-red-400 hover:text-red-600 text-xs self-start pt-1"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => setDialog([...phase.dialog, ""])}
            className="text-xs text-blue-500 hover:text-blue-700"
          >
            + 대사 추가
          </button>
        </div>
      </section>

      <p className="text-[10px] text-gray-400 leading-relaxed">
        상태 전환(트리거·조건·액션)은 페이즈를 연결한 엣지를 선택해 편집합니다.
      </p>
    </div>
  );
}
