"use client";

import type { Character, Choice } from "@/types/web-adventure";
import { estimateSuccessPercent } from "@/lib/web-adventure/engine/rollDice";

// 선택지 리스트 — 종류별 (plain/probability/conditional) 렌더.

const STAT_LABELS_SHORT: Record<string, string> = {
  str: "힘",
  dex: "민첩",
  int: "지능",
  cha: "카리스마",
  con: "체력",
  wis: "지혜",
};

type Props = {
  choices: Choice[];
  character: Character;
  onChoose: (choiceId: string) => void;
};

export default function ChoiceList({ choices, character, onChoose }: Props) {
  if (choices.length === 0) {
    return <p className="text-amber-700 italic">선택할 수 있는 행동이 없다.</p>;
  }

  return (
    <ul className="space-y-2">
      {choices.map((c) => {
        if (c.kind === "plain") {
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChoose(c.id)}
                className="w-full text-left rounded-md bg-amber-50 border border-amber-300 px-4 py-3 hover:bg-amber-100 transition-colors"
              >
                {c.label}
              </button>
            </li>
          );
        }
        if (c.kind === "probability") {
          const percent = estimateSuccessPercent({
            stat: character.stats[c.stat],
            ability: character.ability,
            statKey: c.stat,
            difficulty: c.difficulty,
          });
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChoose(c.id)}
                className="w-full text-left rounded-md bg-amber-50 border border-amber-300 px-4 py-3 hover:bg-amber-100 transition-colors flex justify-between items-center"
              >
                <span>{c.label}</span>
                <span className="text-sm text-amber-800 ml-3 shrink-0">
                  [{STAT_LABELS_SHORT[c.stat] ?? c.stat} {percent}%]
                </span>
              </button>
            </li>
          );
        }
        // conditional
        let allowed = true;
        let reason = "";
        if (c.condition.kind === "minStat") {
          allowed = character.stats[c.condition.stat] >= c.condition.min;
          reason = `${STAT_LABELS_SHORT[c.condition.stat] ?? c.condition.stat} ${c.condition.min} 이상 필요`;
        } else if (c.condition.kind === "hasItem") {
          allowed = character.inventory.includes(c.condition.itemId);
          reason = `아이템 필요: ${c.condition.itemId}`;
        } else {
          allowed = !!character.flags[c.condition.key];
          reason = `조건 필요: ${c.condition.key}`;
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
