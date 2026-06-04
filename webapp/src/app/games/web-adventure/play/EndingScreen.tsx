"use client";

import type { Character, StatKey } from "@/types/web-adventure";
import { getEndingMeta } from "@/content/web-adventure/endings";

// 엔딩 화면 — 제목/에필로그/최종 스탯/선택 로그/다시 시작.
// state.phase === "ended" 일 때만 렌더된다.

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

export default function EndingScreen({ endingId, character, log, onRestart }: Props) {
  const meta = getEndingMeta(endingId);
  return (
    <section className="rounded-lg bg-amber-100/70 border border-amber-300 p-6 shadow-sm text-center">
      <h2 className="text-2xl font-bold mb-3">{meta.title}</h2>
      <p className="mb-5 text-amber-900 leading-relaxed">{meta.epilogue}</p>

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
