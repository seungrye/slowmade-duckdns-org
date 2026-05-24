"use client";

import type { QuestPhaseDef, QuestTransition } from "@/types/quest";
import type { VillagerDocument } from "@/types/villager";
import { NpcCombobox } from "./npc-combobox";
import { CloseButton } from "./close-button";
import { conditionSummary } from "@/lib/condition-summary";

interface Props {
  phaseId: string;
  phase: QuestPhaseDef;
  isInitial: boolean;
  giverNpc: string;
  villagers?: VillagerDocument[];
  /** 전체 transition 목록 (이 phase 에서 나가는 것만 추려서 표시) */
  transitions?: QuestTransition[];
  onUpdate: (phase: QuestPhaseDef) => void;
  onUpdateGiverNpc: (v: string) => void;
  onDelete: () => void;
  onSetInitial: () => void;
  /** 나가는 전환 행 클릭 시 해당 transition 편집(EdgePanel)으로 전환 */
  onEditTransition?: (index: number) => void;
  onClose?: () => void;
}

export function PhasePanel({
  phaseId,
  phase,
  isInitial,
  giverNpc,
  villagers = [],
  transitions = [],
  onUpdate,
  onUpdateGiverNpc,
  onDelete,
  onSetInitial,
  onEditTransition,
  onClose,
}: Props) {
  function setDialog(lines: string[]) { onUpdate({ ...phase, dialog: lines }); }
  function setObjective(v: string) { onUpdate({ ...phase, objective: v || null }); }

  // 이 phase 에서 나가는 전환 (배열 순서 유지 — 같은 트리거끼리 위에서부터 첫 매칭)
  const outgoing = transitions
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => t.from === phaseId);

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
          <CloseButton onClose={onClose} />
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

      {/* 이 페이즈에서 나가는 전환 */}
      <section>
        <label className="text-xs font-semibold text-gray-500 block mb-1">
          나가는 전환 {outgoing.length > 0 && `(${outgoing.length})`}
        </label>
        {outgoing.length === 0 ? (
          <p className="text-[10px] text-gray-400 leading-relaxed">
            이 페이즈에서 나가는 전환이 없습니다 (terminal). 다른 페이즈로
            드래그해 연결하면 전환이 추가됩니다.
          </p>
        ) : (
          <div className="space-y-1">
            {outgoing.map(({ t, index }) => {
              const isAuto = t.trigger === "Auto";
              const selfLoop = t.to === phaseId;
              return (
                <button
                  key={index}
                  onClick={() => onEditTransition?.(index)}
                  className="w-full text-left border rounded p-1.5 hover:border-blue-400 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                        isAuto
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      }`}
                    >
                      {isAuto ? "자동" : "대화"}
                    </span>
                    <span className="text-[11px] text-gray-400">→</span>
                    <span className="text-[11px] font-mono font-medium truncate">
                      {t.to}{selfLoop && " (제자리)"}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    조건: {conditionSummary(t.when)}
                  </div>
                </button>
              );
            })}
            <p className="text-[9px] text-gray-400 leading-relaxed pt-0.5">
              같은 트리거(자동/대화)끼리 위에서부터 조건이 맞는 첫 전환만
              실행됩니다. 행을 클릭하면 편집합니다.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
