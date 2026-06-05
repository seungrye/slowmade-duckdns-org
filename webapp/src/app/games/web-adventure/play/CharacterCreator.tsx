"use client";

import { useMemo, useState } from "react";
import type { AbilityKey, Character, StatKey } from "@/types/web-adventure";
import { ABILITY_KEYS, abilities } from "@/content/web-adventure/abilities";

// 캐릭터 생성 UI — 기본 5 + 보너스 5 포인트 분배(스탯당 최대 +2) + 어빌 1 선택.

const STAT_KEYS: StatKey[] = ["str", "dex", "int", "cha", "con", "wis"];
const STAT_LABELS: Record<StatKey, string> = {
  str: "힘 (str)",
  dex: "민첩 (dex)",
  int: "지능 (int)",
  cha: "카리스마 (cha)",
  con: "체력 (con)",
  wis: "지혜 (wis)",
};

const BASE_STAT = 5;
const BONUS_TOTAL = 5;
const MAX_BONUS_PER_STAT = 2;

// 3 주차 HP 공식: maxHp = 100 + con * 5 (con 5 기본 → 125, con 7 최대 → 135).
const MAX_HP_BASE = 100;
const MAX_HP_PER_CON = 5;
const LUCKY_REROLLS = 3;

type Props = {
  onComplete: (character: Character) => void;
};

export default function CharacterCreator({ onComplete }: Props) {
  const [bonus, setBonus] = useState<Record<StatKey, number>>({
    str: 0,
    dex: 0,
    int: 0,
    cha: 0,
    con: 0,
    wis: 0,
  });
  const [ability, setAbility] = useState<AbilityKey>("lunar");

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

  const previewCon = BASE_STAT + bonus.con;
  const previewMaxHp = MAX_HP_BASE + previewCon * MAX_HP_PER_CON;
  const previewRerolls = ability === "none" ? LUCKY_REROLLS : 0;

  function submit() {
    if (!canSubmit) return;
    const stats: Record<StatKey, number> = {
      str: BASE_STAT + bonus.str,
      dex: BASE_STAT + bonus.dex,
      int: BASE_STAT + bonus.int,
      cha: BASE_STAT + bonus.cha,
      con: BASE_STAT + bonus.con,
      wis: BASE_STAT + bonus.wis,
    };
    // 3 주차 HP 공식: 100 + con * 5.
    const maxHp = MAX_HP_BASE + stats.con * MAX_HP_PER_CON;
    const character: Character = {
      stats,
      hp: maxHp,
      maxHp,
      ability,
      // #253 〈에테르니아〉 임시 — Kael(솔라리스 탈영병) 기본 + 침식 0 시작.
      //   Phase 1b 에서 3 주인공 선택 카드 + 시작 침식도 차등 (Kael 80, Rin 10, Solwen 0).
      protagonist: "kael",
      stigmaErosion: 0,
      inventory: [],
      flags: {},
      rerollsLeft: ability === "none" ? LUCKY_REROLLS : 0,
    };
    onComplete(character);
  }

  return (
    <section className="rounded-lg bg-amber-100/70 border border-amber-300 p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-2">캐릭터 생성</h2>
      <p className="text-sm text-amber-800 mb-4">
        기본 스탯 {BASE_STAT}. 보너스 {BONUS_TOTAL} 포인트를 분배하세요 (스탯당 최대 +
        {MAX_BONUS_PER_STAT}). 남은 포인트:{" "}
        <span className="font-bold">{remaining}</span>
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {STAT_KEYS.map((k) => {
          const value = BASE_STAT + bonus[k];
          const decDisabled = bonus[k] <= 0;
          const incDisabled = remaining <= 0 || bonus[k] >= MAX_BONUS_PER_STAT;
          return (
            <li
              key={k}
              className="flex items-center justify-between rounded-md bg-amber-50 border border-amber-200 px-3 py-2"
            >
              <span className="font-medium">{STAT_LABELS[k]}</span>
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

      <h3 className="text-lg font-semibold mb-2">어빌리티</h3>
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
          재굴림 횟수:{" "}
          <span className="font-mono font-bold">{previewRerolls}</span>
          {ability === "none" ? (
            <span className="text-amber-700"> (행운아 어빌)</span>
          ) : (
            <span className="text-amber-700"> (행운아 어빌 선택 시 +{LUCKY_REROLLS})</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full rounded-md bg-amber-700 text-amber-50 px-5 py-2 font-semibold hover:bg-amber-800 disabled:opacity-40 transition-colors"
      >
        {canSubmit ? "모험 시작" : `보너스 ${remaining} 포인트 남음`}
      </button>
    </section>
  );
}
