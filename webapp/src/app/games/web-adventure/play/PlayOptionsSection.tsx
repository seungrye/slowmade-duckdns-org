"use client";

// PlayOptionsSection - the #351/v3 play option toggles.
//
// A *collapsible* (<details>) options block inside StatusPanel. The desktop sidebar and the mobile drawer
// mount the same component, so one edit applies to both.
//
// The options:
//   1) the typewriter effect - on/off.
//   2) automatically skipping visited scenes - on/off (accumulated across runs).
//   3) clearing the visit record - a destructive action (confirmed).
//
// Each toggle reaches localStorage at once. It does not apply to *the current scene* but
// from *the next* one (SceneRenderer's skipSequential useMemo([scene.id])).

import { useEffect, useState } from "react";
import {
  clearVisitedScenes,
  getSkipVisitedEnabled,
  getTypewriterEnabled,
  getVisitedScenes,
  setSkipVisitedEnabled,
  setTypewriterEnabled,
} from "@/lib/web-adventure/play/typewriter-options";

function Toggle({
  label,
  hint,
  checked,
  onChange,
  testid,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  testid: string;
}) {
  // The whole area is the button (role=switch). The label, hint and switch are all clickable.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="w-full flex items-start justify-between gap-2 select-none py-1 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-1 rounded"
      data-testid={`${testid}-switch`}
      data-checked={checked ? "true" : "false"}
    >
      <span className="flex-1">
        <span className="block text-xs text-amber-900">{label}</span>
        {hint && (
          <span className="block text-[10px] text-amber-700/80">{hint}</span>
        )}
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-amber-700" : "bg-amber-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-amber-50 transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export default function PlayOptionsSection() {
  // SSR-safe - the default initially, synced to the real value after mounting.
  const [mounted, setMounted] = useState(false);
  const [typewriterOn, setTypewriterOn] = useState(true);
  const [skipVisitedOn, setSkipVisitedOn] = useState(false);
  const [visitedCount, setVisitedCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    setTypewriterOn(getTypewriterEnabled());
    setSkipVisitedOn(getSkipVisitedEnabled());
    setVisitedCount(getVisitedScenes().size);
  }, []);

  // Opening the details re-evaluates *the current count* - refreshed mid-game.
  function refreshCount() {
    setVisitedCount(getVisitedScenes().size);
  }

  if (!mounted) {
    return (
      <details className="mt-2 border-t border-amber-300 pt-2" data-testid="play-options">
        <summary className="cursor-pointer text-xs text-amber-800">
          ⚙️ 옵션
        </summary>
      </details>
    );
  }

  return (
    <details
      className="mt-2 border-t border-amber-300 pt-2"
      data-testid="play-options"
      onToggle={refreshCount}
    >
      <summary className="cursor-pointer text-xs text-amber-800">
        ⚙️ 옵션
      </summary>
      <div className="mt-2 space-y-1.5">
        <Toggle
          testid="opt-typewriter"
          label="본문 순차 표시"
          hint="OFF — 본문 전체 즉시 표시."
          checked={typewriterOn}
          onChange={(next) => {
            setTypewriterOn(next);
            setTypewriterEnabled(next);
          }}
        />
        <Toggle
          testid="opt-skip-visited"
          label="방문 씬 자동 skip"
          hint={`다시 본 씬은 즉시 표시 (현재 ${visitedCount} 씬 방문).`}
          checked={skipVisitedOn}
          onChange={(next) => {
            setSkipVisitedOn(next);
            setSkipVisitedEnabled(next);
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (
              typeof window !== "undefined" &&
              window.confirm("방문 기록을 초기화 할까요? 모든 씬을 다시 타이프라이터로 봅니다.")
            ) {
              clearVisitedScenes();
              setVisitedCount(0);
            }
          }}
          className="w-full text-left text-[10px] text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline pt-0.5"
          data-testid="opt-clear-visited"
        >
          방문 기록 초기화
        </button>
        <p className="text-[10px] text-amber-700/70 italic">
          변경은 *다음 씬* 부터 적용됩니다.
        </p>
      </div>
    </details>
  );
}
