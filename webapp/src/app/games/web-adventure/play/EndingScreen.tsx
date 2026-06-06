"use client";

import Link from "next/link";
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

/** #253 〈에테르니아〉 — 엔딩별 톤. 다크 판타지 6 색. */
const ENDING_TONE: Record<string, string> = {
  ascension: "bg-indigo-100/70 border-indigo-300",
  revolution: "bg-orange-100/70 border-orange-400",
  harmony: "bg-emerald-100/70 border-emerald-300",
  fall: "bg-gray-200/80 border-gray-400",
  petrification: "bg-slate-200/80 border-slate-400",
  sylvan_bond: "bg-lime-100/70 border-lime-400",
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
      <p className="mb-3 text-amber-900 leading-relaxed whitespace-pre-line">{meta.epilogue}</p>
      {meta.aftermath && (
        <p
          data-testid="ending-aftermath"
          className="mb-5 text-sm text-amber-800/80 italic leading-relaxed border-t border-amber-300/60 pt-3 whitespace-pre-line"
        >
          {meta.aftermath}
        </p>
      )}

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
        {/* #294 — 최종 침식 표시. 시한부 톤 게임의 *마지막 숨결* — endingId 와 함께 의미. */}
        <div
          data-testid="ending-final-stigma"
          className={`mt-2 flex justify-between rounded border px-3 py-1 text-sm ${
            character.stigmaErosion >= 100
              ? "bg-indigo-100 border-indigo-300 text-indigo-900 font-semibold"
              : character.stigmaErosion >= 80
                ? "bg-indigo-50 border-indigo-200 text-indigo-800"
                : "bg-amber-50 border-amber-200"
          }`}
        >
          <span>성흔 침식</span>
          <span className="font-mono">{character.stigmaErosion} / 100</span>
        </div>
      </section>

      <details className="text-left mb-5 text-sm text-amber-800">
        <summary className="cursor-pointer">선택 로그</summary>
        <ul className="mt-2 space-y-1 pl-4 list-disc">
          {log.map((entry, i) => (
            <li key={i}>{entry}</li>
          ))}
        </ul>
      </details>

      <div className="flex gap-2 justify-center flex-wrap">
        <button
          type="button"
          onClick={onRestart}
          className="inline-block rounded-md bg-amber-700 text-amber-50 px-5 py-2 font-semibold hover:bg-amber-800 transition-colors"
        >
          다시 시작
        </button>
        {/* #250 — 엔딩 도달 후 갤러리 진입 동선. */}
        <Link
          href="/games/web-adventure/gallery"
          className="inline-block rounded-md border border-amber-700 text-amber-800 px-5 py-2 font-semibold hover:bg-amber-100 transition-colors"
        >
          🏆 엔딩 갤러리
        </Link>
      </div>
    </section>
  );
}
