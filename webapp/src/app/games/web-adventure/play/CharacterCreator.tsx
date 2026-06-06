"use client";

// #258 〈에테르니아의 추락〉 — 캐릭터 선택 (스탯 분배 제거).
//
// 흐름:
//   1. 주인공 카드 3 종 (Kael/Rin/Solwen) 중 선택 — 시작 스탯/침식도/씬/인벤 자동.
//   2. 성흔 4 종 (lunar/selene/hecate/none) 선택.
//   3. '모험 시작' → Character + startScene 전달.
//
// 스탯 분배 UI 는 제거. 주인공 정체성 = 고정 스탯 + 시작 침식 + 시작 씬.

import { useState } from "react";
import type { AbilityKey, Character, Protagonist, StatKey } from "@/types/web-adventure";
import { ABILITY_KEYS, abilities } from "@/content/web-adventure/abilities";
import { PROTAGONIST_ORDER, protagonists } from "@/content/web-adventure/protagonists";

const STAT_KEYS: StatKey[] = ["str", "dex", "int", "cha", "con", "wis"];
const STAT_LABELS: Record<StatKey, string> = {
  str: "완력",
  dex: "민첩",
  int: "지능",
  cha: "언변",
  con: "체력",
  wis: "지혜",
};

const MAX_HP_BASE = 100;
const MAX_HP_PER_CON = 5;
const NO_STIGMA_REROLLS = 3;

type Props = {
  onComplete: (character: Character, startScene: string) => void;
};

export default function CharacterCreator({ onComplete }: Props) {
  const [protagonist, setProtagonist] = useState<Protagonist>("kael");
  const [ability, setAbility] = useState<AbilityKey>("lunar");

  const protaMeta = protagonists[protagonist];
  const previewMaxHp = MAX_HP_BASE + protaMeta.baseStats.con * MAX_HP_PER_CON;
  const previewRerolls = ability === "none" ? NO_STIGMA_REROLLS : 0;

  function submit() {
    const stats: Record<StatKey, number> = { ...protaMeta.baseStats };
    const maxHp = MAX_HP_BASE + stats.con * MAX_HP_PER_CON;
    const character: Character = {
      stats,
      hp: maxHp,
      maxHp,
      ability,
      protagonist,
      stigmaErosion: protaMeta.startStigma,
      inventory: [...protaMeta.startInventory],
      flags: {},
      rerollsLeft: ability === "none" ? NO_STIGMA_REROLLS : 0,
    };
    onComplete(character, protaMeta.startScene);
  }

  return (
    <section className="rounded-lg bg-amber-100/70 border border-amber-300 p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-2">너의 운명을 선택하라</h2>
      <p className="text-sm text-amber-800 mb-4">
        세 달이 정렬하는 마지막 사흘, 세 개의 시선이 같은 종말을 향해 걷는다. 한 사람의
        선택이 세계의 모양을 바꾼다. 그러나 그 손에는 — *침식의 흔적* 이 함께 따른다.
      </p>

      {/* 1. 주인공 3 카드 */}
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {PROTAGONIST_ORDER.map((p) => {
          const meta = protagonists[p];
          const selected = protagonist === p;
          return (
            <li key={p}>
              <button
                type="button"
                onClick={() => setProtagonist(p)}
                aria-pressed={selected}
                className={`w-full text-left rounded-md border p-3 transition-colors ${
                  selected
                    ? "bg-amber-700 text-amber-50 border-amber-800"
                    : "bg-amber-50 border-amber-200 hover:bg-amber-100"
                }`}
              >
                <div className="font-semibold">{meta.name}</div>
                <div className={`text-xs mt-0.5 ${selected ? "text-amber-100" : "text-amber-800"}`}>
                  {meta.oneLine}
                </div>
                <div className={`text-xs mt-2 ${selected ? "text-amber-50" : "text-amber-700"}`}>
                  시작 침식 <span className="font-mono font-bold">{meta.startStigma}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-amber-800 mb-3 italic">{protaMeta.description}</p>

      {/* 2. 시작 스탯 표시 (수정 불가) */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-amber-900 mb-2">시작 능력치</h3>
        <ul className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {STAT_KEYS.map((k) => {
            // #291 — 시작 침식 50+ 시 con/dex -2 디버프 미리 표시.
            //   Kael (시작 80) 카드 선택 시 사용자가 *바로 디버프 인지*.
            const debuffed =
              protaMeta.startStigma >= 50 && (k === "con" || k === "dex");
            const effective = debuffed
              ? protaMeta.baseStats[k] - 2
              : protaMeta.baseStats[k];
            return (
              <li
                key={k}
                className={`rounded-md border px-2 py-1 text-center text-xs ${
                  debuffed
                    ? "bg-indigo-50 border-indigo-300"
                    : "bg-amber-50 border-amber-200"
                }`}
                title={
                  debuffed
                    ? `침식 ${protaMeta.startStigma} → ${STAT_LABELS[k]} -2 디버프`
                    : undefined
                }
              >
                <div className={debuffed ? "text-indigo-700" : "text-amber-700"}>
                  {STAT_LABELS[k]}
                </div>
                <div className="font-mono font-bold text-base">
                  {effective}
                  {debuffed && (
                    <span className="text-xs text-indigo-600 ml-1">
                      ({protaMeta.baseStats[k]}-2)
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {protaMeta.startStigma >= 50 && (
          <p
            data-testid="stigma-debuff-warning"
            className="mt-2 text-xs text-indigo-700"
          >
            ⚠️ 시작 침식 {protaMeta.startStigma} — 체력·민첩 -2 디버프 (50 이상).
          </p>
        )}
      </div>

      {/* 3. 성흔 4 종 */}
      <h3 className="text-lg font-semibold mb-2">너의 핏줄에 흐르는 성흔</h3>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {ABILITY_KEYS.map((k) => {
          const a = abilities[k];
          const selected = ability === k;
          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => setAbility(k)}
                aria-pressed={selected}
                className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                  selected
                    ? "bg-amber-700 text-amber-50 border-amber-800"
                    : "bg-amber-50 border-amber-200 hover:bg-amber-100"
                }`}
              >
                <div className="font-semibold">{a.name}</div>
                <div className={`text-sm ${selected ? "text-amber-100" : "text-amber-800"}`}>
                  {a.desc}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
        <div>
          최대 HP: <span className="font-mono font-bold">{previewMaxHp}</span>{" "}
          <span className="text-amber-700">(공식: {MAX_HP_BASE} + 체력 × {MAX_HP_PER_CON})</span>
        </div>
        <div>
          재굴림 횟수: <span className="font-mono font-bold">{previewRerolls}</span>
          {ability === "none" ? (
            <span className="text-amber-700"> (무흔)</span>
          ) : (
            <span className="text-amber-700"> (무흔 선택 시 +{NO_STIGMA_REROLLS})</span>
          )}
        </div>
        <div>
          시작 침식: <span className="font-mono font-bold">{protaMeta.startStigma}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        className="w-full rounded-md bg-amber-700 text-amber-50 px-5 py-2 font-semibold hover:bg-amber-800 transition-colors"
      >
        {protaMeta.name} 의 운명으로 발을 내딛는다
      </button>
    </section>
  );
}
