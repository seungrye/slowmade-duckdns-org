"use client";

import type { Character, StatKey } from "@/types/web-adventure";
import { getEndingMeta } from "@/lib/web-adventure/engine/endingResolver";

// 엔딩 화면 — 제목/에필로그/최종 스탯/선택 로그/다시 시작.
// state.phase === "ended" 일 때만 렌더된다.
// 4 주차: 엔딩별 icon + 엔딩 종류별 색감 분기 (light tinting).

type Props = {
  endingId: string;
  character: Character;
  log: string[];
  onRestart: () => void;
};

const STAT_LABELS: Record<StatKey, string> = {
  str: "힘",
  dex: "민첩",
  int: "지능",
  cha: "카리스마",
  con: "체력",
  wis: "지혜",
};

const STAT_ORDER: StatKey[] = ["str", "dex", "int", "cha", "con", "wis"];

/** 엔딩 종류별 *컨테이너* 톤. 기본 amber, 실패는 회색, 정착은 파랑. */
const ENDING_TONE: Record<string, string> = {
  fail: "bg-gray-100/80 border-gray-300",
  shopkeeper: "bg-blue-100/70 border-blue-300",
  wizard_apprentice: "bg-purple-100/70 border-purple-300",
};

export default function EndingScreen({ endingId, character, log, onRestart }: Props) {
  const meta = getEndingMeta(endingId);
  const tone = ENDING_TONE[endingId] ?? "bg-amber-100/70 border-amber-300";
  return (
    <section
      className={`rounded-lg ${tone} border p-6 shadow-sm text-center transition-colors`}
      data-testid="ending-screen"
      data-ending-id={endingId}
    >
      <div className="text-5xl mb-3" aria-hidden>
        {meta.icon}
      </div>
      <h2 className="text-2xl font-bold mb-3">{meta.title}</h2>
      <p className="mb-5 text-amber-900 leading-relaxed whitespace-pre-line">{meta.epilogue}</p>

      <section className="mb-5 text-left">
        <h3 className="text-lg font-semibold mb-2 text-center">최종 스탯</h3>
        <ul className="grid grid-cols-2 gap-2 text-sm">
          {STAT_ORDER.map((k) => (
            <li
              key={k}
              className="flex justify-between rounded bg-amber-50 border border-amber-200 px-3 py-1"
            >
              <span>{STAT_LABELS[k]}</span>
              <span className="font-mono">{character.stats[k]}</span>
            </li>
          ))}
        </ul>
      </section>

      <details className="text-left mb-5 text-sm text-amber-800">
        <summary className="cursor-pointer">선택 로그</summary>
        <ul className="mt-2 space-y-1 pl-4 list-disc">
          {log.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      </details>

      <button
        type="button"
        onClick={onRestart}
        className="inline-block rounded-md bg-amber-700 text-amber-50 px-5 py-2 font-semibold hover:bg-amber-800 transition-colors"
      >
        다시 시작
      </button>
    </section>
  );
}
