"use client";

// #251 〈에테르니아의 추락〉 — 3 주인공 카드 + 4 성흔 선택 UI.
//
// 흐름:
//   1. 주인공 카드 3 종 (Kael/Rin/Solwen) 중 선택 — 시작 스탯/침식도/씬/인벤이 *자동 차등*.
//   2. 성흔 4 종 (lunar/selene/hecate/none) 선택.
//   3. 보너스 5 포인트 분배 (스탯당 최대 +2).
//   4. '모험 시작' → Character 객체 + startScene 을 함께 onComplete.
//
// 기존 단일 주인공/4 어빌 카드 구조를 *3 주인공 × 4 성흔* 의 2 단계로 확장.

import { useMemo, useState } from "react";
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

const BONUS_TOTAL = 5;
const MAX_BONUS_PER_STAT = 2;

const MAX_HP_BASE = 100;
const MAX_HP_PER_CON = 5;
const NO_STIGMA_REROLLS = 3;

type Props = {
  /** 시작 씬 id 가 주인공마다 다르므로 함께 전달. */
  onComplete: (character: Character, startScene: string) => void;
};

export default function CharacterCreator({ onComplete }: Props) {
  const [protagonist, setProtagonist] = useState<Protagonist>("kael");
  const [bonus, setBonus] = useState<Record<StatKey, number>>({
    str: 0,
    dex: 0,
    int: 0,
    cha: 0,
    con: 0,
    wis: 0,
  });
  const [ability, setAbility] = useState<AbilityKey>("lunar");

  const protaMeta = protagonists[protagonist];

  const spent = useMemo(
    () => STAT_KEYS.reduce((acc, k) => acc + bonus[k], 0),
    [bonus],
  );
  const remaining = BONUS_TOTAL - spent;
  const canSubmit = remaining === 0;

  function inc(stat: StatKey) {
    if (remaining <= 0) return;
    if (bonus[stat] >= MAX_BONUS_PER_STAT) return;
    setBonus((b) => ({ ...b, [stat]: b[stat] + 1 }));
  }
  function dec(stat: StatKey) {
    if (bonus[stat] <= 0) return;
    setBonus((b) => ({ ...b, [stat]: b[stat] - 1 }));
  }

  const previewCon = protaMeta.baseStats.con + bonus.con;
  const previewMaxHp = MAX_HP_BASE + previewCon * MAX_HP_PER_CON;
  const previewRerolls = ability === "none" ? NO_STIGMA_REROLLS : 0;

  function submit() {
    if (!canSubmit) return;
    const stats: Record<StatKey, number> = {
      str: protaMeta.baseStats.str + bonus.str,
      dex: protaMeta.baseStats.dex + bonus.dex,
      int: protaMeta.baseStats.int + bonus.int,
      cha: protaMeta.baseStats.cha + bonus.cha,
      con: protaMeta.baseStats.con + bonus.con,
      wis: protaMeta.baseStats.wis + bonus.wis,
    };
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
      <h2 className="text-xl font-semibold mb-2">시작 인물 선택</h2>
      <p className="text-sm text-amber-800 mb-4">
        세 인물 중 하나의 시점으로 〈에테르니아의 추락〉 을 살아낸다. 같은 위기를 다른 각도로
        보게 될 것이다.
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

      {/* 2. 보너스 분배 */}
      <h3 className="text-lg font-semibold mb-2">보너스 분배 ({remaining} 남음)</h3>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {STAT_KEYS.map((k) => {
          const value = protaMeta.baseStats[k] + bonus[k];
          const decDisabled = bonus[k] <= 0;
          const incDisabled = remaining <= 0 || bonus[k] >= MAX_BONUS_PER_STAT;
          return (
            <li
              key={k}
              className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-200 px-3 py-2"
            >
              <span className="font-medium">{STAT_LABELS[k]} ({k})</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => dec(k)}
                  disabled={decDisabled}
                  aria-label={`${STAT_LABELS[k]} 감소`}
                  className="w-7 h-7 rounded bg-amber-700 text-amber-50 disabled:opacity-30 hover:bg-amber-800"
                >
                  −
                </button>
                <span className="w-10 text-center font-mono">{value}</span>
                <button
                  type="button"
                  onClick={() => inc(k)}
                  disabled={incDisabled}
                  aria-label={`${STAT_LABELS[k]} 증가`}
                  className="w-7 h-7 rounded bg-amber-700 text-amber-50 disabled:opacity-30 hover:bg-amber-800"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 3. 성흔 4 종 */}
      <h3 className="text-lg font-semibold mb-2">성흔 선택</h3>
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
          최대 HP 미리보기: <span className="font-mono font-bold">{previewMaxHp}</span>{" "}
          <span className="text-amber-700">(공식: {MAX_HP_BASE} + 체력 × {MAX_HP_PER_CON})</span>
        </div>
        <div>
          재굴림 횟수: <span className="font-mono font-bold">{previewRerolls}</span>{" "}
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
        disabled={!canSubmit}
        className="w-full rounded-md bg-amber-700 text-amber-50 px-5 py-2 font-semibold hover:bg-amber-800 disabled:opacity-40 transition-colors"
      >
        {canSubmit ? `${protaMeta.name} 으로 시작` : `보너스 ${remaining} 포인트 남음`}
      </button>
    </section>
  );
}
