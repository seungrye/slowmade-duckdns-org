"use client";

// PlayOptionsSection — #351/v3 플레이 옵션 토글.
//
// StatusPanel 안 *접이식* (<details>) 옵션. 데스크탑 사이드 + 모바일 drawer
// 둘 다 같은 컴포넌트 마운트 → 한 곳 수정으로 양쪽 적용.
//
// 옵션:
//   1) 타이프라이터 효과 — ON/OFF.
//   2) 방문 씬 자동 skip — ON/OFF (회차 누적).
//   3) 방문 기록 초기화 — destructive 액션 (confirm).
//
// 각 토글 즉시 localStorage 반영. *현재 씬* 에는 적용 안 되고
// *다음 씬* 부터 적용 (SceneRenderer 의 skipSequential useMemo([scene.id])).

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
  // 전체 영역 = button (role=switch). 라벨/힌트/스위치 모두 클릭 가능.
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
  // SSR safe — 초기엔 default, mount 후 실제 값 동기화.
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

  // details open 시 *현재 카운트* 다시 평가 — 게임 진행 중 갱신.
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
