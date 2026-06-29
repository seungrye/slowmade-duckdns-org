"use client";

import type { Character, Choice } from "@/types/web-adventure";
import { estimateSuccessPercent } from "@/lib/web-adventure/engine/rollDice";
import { effectiveStat } from "@/lib/web-adventure/engine/stats";
import { items } from "@/content/web-adventure/items";
import {
  isChoiceAvailable,
  isChoiceVisible,
} from "@/lib/web-adventure/engine/choiceFilter";

// 선택지 리스트 — 종류별 (plain/probability/conditional) 렌더.
// 4 주차: conditional + hidden=true 미충족 시 *완전 숨김*.

const STAT_LABELS_SHORT: Record<string, string> = {
  str: "힘",
  dex: "민첩",
  int: "지능",
  cha: "카리스마",
  con: "체력",
  wis: "지혜",
};

const FLAG_LABEL_KO: Record<string, string> = {
  hasSecretSnack: "비밀 간식",
  caughtBefore: "이전에 들킨 적 있음",
  caughtCount: "들킨 횟수",
};

type Props = {
  choices: Choice[];
  character: Character;
  onChoose: (choiceId: string) => void;
};

export default function ChoiceList({ choices, character, onChoose }: Props) {
  // 4 주차 — hidden 모드: 보이지 않는 선택지를 사전 필터.
  const visibleChoices = choices.filter((c) => isChoiceVisible(c, character));

  if (visibleChoices.length === 0) {
    return <p className="text-amber-700 italic">선택할 수 있는 행동이 없다.</p>;
  }

  return (
    <ul className="space-y-2">
      {visibleChoices.map((c) => {
        if (c.kind === "plain") {
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChoose(c.id)}
                className="w-full text-left rounded-md bg-amber-50 border border-amber-300 px-4 py-3 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-1 transition-colors"
              >
                {c.label}
              </button>
            </li>
          );
        }
        if (c.kind === "probability") {
          // 3 주차: effectiveStat (base + passive) 으로 백분율 계산.
          const percent = estimateSuccessPercent({
            stat: effectiveStat(character, c.stat),
            ability: character.ability,
            statKey: c.stat,
            difficulty: c.difficulty,
          });
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChoose(c.id)}
                title={`${STAT_LABELS_SHORT[c.stat] ?? c.stat} ${effectiveStat(character, c.stat)} + d20 ≥ ${c.difficulty}`}
                className="w-full text-left rounded-md bg-amber-50 border border-amber-300 px-4 py-3 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-1 transition-colors flex justify-between items-center"
              >
                <span>{c.label}</span>
                <span className="text-sm text-amber-800 ml-3 shrink-0">
                  [확률 {percent}%]
                </span>
              </button>
            </li>
          );
        }
        // conditional — hidden=false 또는 미정의 시 회색 표시 (isChoiceVisible 가 true 임을 보장).
        const allowed = isChoiceAvailable(c, character);
        let reason = "";
        if (c.condition.kind === "minStat") {
          reason = `${STAT_LABELS_SHORT[c.condition.stat] ?? c.condition.stat} ${c.condition.min} 이상 필요`;
        } else if (c.condition.kind === "hasItem") {
          const item = items[c.condition.itemId];
          reason = `아이템 필요: ${item ? item.displayName : c.condition.itemId}`;
        } else if (c.condition.kind === "flag") {
          const label = FLAG_LABEL_KO[c.condition.key] ?? c.condition.key;
          reason = `${label} 필요`;
        } else if (c.condition.kind === "minFlag") {
          const label = FLAG_LABEL_KO[c.condition.key] ?? c.condition.key;
          reason = `${label} ${c.condition.min} 이상 필요`;
        } else if (c.condition.kind === "ability") {
          // #321 ability — 4 성흔별.
          const ABILITY_KO: Record<string, string> = { lunar: "루나", selene: "셀레네", hecate: "헤카테", none: "무흔" };
          reason = `성흔 필요: ${ABILITY_KO[c.condition.required] ?? c.condition.required}`;
        } else if (c.condition.kind === "stigmaAtLeast") {
          reason = `침식도 ${c.condition.min} 이상 필요`;
        } else {
          // #359 all — 복합 조건.
          reason = "여러 조건 충족 필요";
        }
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => allowed && onChoose(c.id)}
              disabled={!allowed}
              title={allowed ? "" : reason}
              className={`w-full text-left rounded-md border px-4 py-3 transition-colors ${
                allowed
                  ? "bg-amber-50 border-amber-300 hover:bg-amber-100"
                  : "bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <span>{c.label}</span>
              {!allowed && <span className="text-xs ml-2">({reason})</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
