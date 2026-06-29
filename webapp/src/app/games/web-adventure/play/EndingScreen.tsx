"use client";

import Image from "next/image";
import Link from "next/link";
import type { Character, Protagonist, Scene, StatKey } from "@/types/web-adventure";
import { getEndingMeta } from "@/lib/web-adventure/engine/endingResolver";
import { protagonists } from "@/content/web-adventure/protagonists";
import { renderInline } from "@/lib/web-adventure/play/render-inline";

// 엔딩 화면 — 제목/에필로그/최종 스탯/선택 로그/다시 시작.
// state.phase === "ended" 일 때만 렌더된다.
// 4 주차: 엔딩별 icon + 엔딩 종류별 색감 분기 (light tinting).

type Props = {
  endingId: string;
  character: Character;
  log: string[];
  /** 마지막 씬 — *발각/죽음 전환 씬*(id 가 ending_ 아님)이면 본문을 엔딩 위에 표시. */
  finalScene?: Scene;
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

export default function EndingScreen({ endingId, character, log, finalScene, onRestart }: Props) {
  const meta = getEndingMeta(endingId);
  const tone = ENDING_TONE[endingId] ?? "bg-amber-100/70 border-amber-300";
  // ending_* 씬은 본문=epilogue 라 생략. 발각/죽음 전환 씬만 본문을 엔딩 위에 표시.
  const transitionBody =
    finalScene && !finalScene.id.startsWith("ending_") && finalScene.body?.length
      ? finalScene.body
      : null;
  return (
    <section
      className={`rounded-lg ${tone} border p-6 shadow-sm text-center transition-colors`}
      data-testid="ending-screen"
      data-ending-id={endingId}
    >
      {/* 엔딩 일러스트 — finalScene 의 이미지 (발각/엔딩 씬). 이모지만 있던 화면을 채움. */}
      {finalScene?.illustration && (
        <div className="relative w-full aspect-[16/9] rounded-md overflow-hidden mb-4 border border-black/10">
          <Image
            src={finalScene.illustration}
            alt={`${meta.title} 일러스트`}
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      {transitionBody && finalScene && (
        <div
          className="mb-5 text-left border-b border-amber-300/60 pb-4"
          data-testid="ending-transition-scene"
        >
          <h3 className="text-lg font-bold mb-2 text-center">{finalScene.title}</h3>
          {transitionBody.map((p, i) => (
            <p key={i} className="mb-1 text-amber-900 leading-relaxed whitespace-pre-line">
              {renderInline(p)}
            </p>
          ))}
        </div>
      )}
      <div className="text-5xl mb-3" aria-hidden>
        {meta.icon}
      </div>
      <h2 className="text-2xl font-bold mb-1">{meta.title}</h2>
      {/* #295 — 주인공 이름 표시. *어느 주인공이* 이 엔딩에 도달했는지 명시. */}
      <p
        data-testid="ending-protagonist"
        className="text-sm text-amber-700 mb-3"
      >
        {protagonists[character.protagonist as Protagonist]?.name ?? character.protagonist}
      </p>
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
        <summary className="cursor-pointer">📜 지금까지의 흐름 ({log.length} 항목)</summary>
        {/* #348 — 흐름 로그: prefix 별 시각 구분 */}
        <ul className="mt-2 space-y-1 max-h-[60vh] overflow-y-auto pr-2">
          {log.map((entry, i) => {
            // ▶ 씬 진입 (제목) — 강조.
            if (entry.startsWith("▶ ")) {
              return (
                <li key={i} className="font-semibold text-amber-900 pt-2 first:pt-0">
                  {entry}
                </li>
              );
            }
            // → 선택 라벨 — 이탤릭.
            if (entry.startsWith("→ ")) {
              return (
                <li key={i} className="italic text-amber-700 pl-3">
                  {entry}
                </li>
              );
            }
            // "  " (들여쓰기) — 씬 본문 — 회색.
            if (entry.startsWith("  ")) {
              return (
                <li key={i} className="text-gray-700 dark:text-gray-300 pl-3 whitespace-pre-line">
                  {entry.slice(2)}
                </li>
              );
            }
            // 기타 (사건 — 침식 한계, HP 0, 종료 등) — 빨강.
            return (
              <li key={i} className="text-red-700 dark:text-red-400 pl-3">
                {entry}
              </li>
            );
          })}
        </ul>
      </details>

      <div className="flex gap-2 justify-center flex-wrap">
        <button
          type="button"
          onClick={onRestart}
          className="inline-block rounded-md bg-amber-700 text-amber-50 px-5 py-2 font-semibold hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-900 focus-visible:ring-offset-2 transition-colors"
        >
          다시 시작
        </button>
        {/* #250 — 엔딩 도달 후 갤러리 진입 동선. */}
        <Link
          href="/games/web-adventure/gallery"
          className="inline-block rounded-md border border-amber-700 text-amber-800 px-5 py-2 font-semibold hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 transition-colors"
        >
          🏆 엔딩 갤러리
        </Link>
      </div>
    </section>
  );
}
