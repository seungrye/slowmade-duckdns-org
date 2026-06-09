'use client';

// StatusPanel — Web Adventure 의 통합 사이드 상태 패널 (#241).
//
// 표시 항목:
//   - 6 스탯 (str/dex/int/cha/con/wis) 라벨 + 값 + 막대 그래프 (max 18 기준).
//   - HP 진행도 + maxHp.
//   - 어빌리티 이름 + 한 줄 설명.
//   - 인벤토리 (그룹 + consumable "사용" 버튼).
//   - 재굴림 (canReroll + rerollsLeft>0 시 버튼).
//   - 회차 (runIndex).
//
// 데스크탑은 사이드, 모바일은 MobileDrawer 안에 마운트 (#242 에서).
// 기존 InventoryStrip 의 인벤/HP/재굴림 로직 흡수 — 상위 컴포넌트는 이 패널 하나만 마운트.

import type { Character, StatKey } from '@/types/web-adventure';
import { abilities } from '@/content/web-adventure/abilities';
import { items } from '@/content/web-adventure/items';
import { groupInventory, formatGroupedItem } from '@/lib/web-adventure/engine/inventory';
import PlayOptionsSection from './PlayOptionsSection';

const STAT_KEYS: Array<{ key: StatKey; label: string }> = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'int', label: 'INT' },
  { key: 'cha', label: 'CHA' },
  { key: 'con', label: 'CON' },
  { key: 'wis', label: 'WIS' },
];

const STAT_BAR_MAX = 18;

export interface StatusPanelProps {
  character: Character;
  runIndex: number;
  canReroll: boolean;
  onUseItem: (itemId: string) => void;
  onReroll: () => void;
}

// #259 — 침식 단계.
type StigmaLevel = "normal" | "debuff" | "critical";
function stigmaLevel(stigma: number): StigmaLevel {
  if (stigma >= 80) return "critical";
  if (stigma >= 50) return "debuff";
  return "normal";
}
const STIGMA_FLAVOR: Record<StigmaLevel, string> = {
  normal: "",
  debuff: "손끝이 딱딱하게 굳어갑니다.",
  critical: "체온이 느껴지지 않습니다. 관절을 움직일 때마다 석고가 부서지는 소리가 납니다.",
};
const STIGMA_BAR_COLOR: Record<StigmaLevel, string> = {
  normal: "bg-sky-400/60",
  debuff: "bg-violet-500/70",
  critical: "bg-indigo-700/80 animate-pulse",
};

export default function StatusPanel({
  character,
  runIndex,
  canReroll,
  onUseItem,
  onReroll,
}: StatusPanelProps) {
  const ability = abilities[character.ability];
  const grouped = groupInventory(character.inventory);
  const hpPct = Math.max(0, Math.min(100, (character.hp / character.maxHp) * 100));
  const stigma = character.stigmaErosion;
  const level = stigmaLevel(stigma);
  const stigmaPct = Math.max(0, Math.min(100, stigma));

  return (
    <aside
      data-testid="status-panel"
      className="rounded-md bg-amber-100/70 border border-amber-300 p-3 text-sm"
    >
      {/* 회차 + 어빌리티 헤더 */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs text-amber-700">{runIndex}회차</div>
        <div className="text-xs text-amber-700">
          <span className="font-bold">{ability.name}</span>
          <span className="ml-1 opacity-70">{ability.desc}</span>
        </div>
      </div>

      {/* HP */}
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-0.5">
          <span>HP</span>
          <span className="font-mono">{character.hp} / {character.maxHp}</span>
        </div>
        <div className="h-2 bg-amber-200/60 rounded overflow-hidden">
          <div
            className="h-full bg-rose-600/80"
            style={{ width: `${hpPct}%` }}
            data-testid="hp-bar"
          />
        </div>
      </div>

      {/* #259 — 성흔 침식 */}
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-0.5">
          <span>성흔 침식</span>
          <span className="font-mono">{stigma} / 100</span>
        </div>
        <div
          className={`h-2 rounded overflow-hidden ${level === "critical" ? "bg-indigo-200/70 ring-1 ring-indigo-400" : "bg-amber-200/60"}`}
        >
          <div
            className={`h-full ${STIGMA_BAR_COLOR[level]}`}
            style={{ width: `${stigmaPct}%` }}
            data-testid="stigma-bar"
            data-level={level}
          />
        </div>
        {STIGMA_FLAVOR[level] && (
          <div
            className={`text-[10px] italic mt-0.5 ${level === "critical" ? "text-indigo-800 font-semibold" : "text-violet-800"}`}
          >
            {STIGMA_FLAVOR[level]}
          </div>
        )}
      </div>

      {/* 6 스탯 바 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2">
        {STAT_KEYS.map(({ key, label }) => {
          const v = character.stats[key];
          const pct = Math.max(0, Math.min(100, (v / STAT_BAR_MAX) * 100));
          return (
            <div key={key}>
              <div className="flex justify-between text-xs">
                <span className="font-bold text-amber-900">{label}</span>
                <span className="font-mono">{v}</span>
              </div>
              <div className="h-1.5 bg-amber-200/60 rounded overflow-hidden">
                <div
                  className="h-full bg-amber-700/80"
                  style={{ width: `${pct}%` }}
                  data-testid={`stat-bar-${key}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 재굴림 */}
      <div className="flex items-center justify-between mb-2 text-xs">
        <span>
          재굴림 <span className="font-mono font-bold">{character.rerollsLeft}</span>
        </span>
        {canReroll && character.rerollsLeft > 0 && (
          <button
            type="button"
            onClick={onReroll}
            className="rounded bg-amber-700 text-amber-50 px-2 py-0.5 hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-900 focus-visible:ring-offset-1"
          >
            재굴림: 다시 굴리기
          </button>
        )}
      </div>

      {/* 인벤토리 */}
      <div className="mt-2 border-t border-amber-300 pt-2">
        <div className="text-xs text-amber-800 mb-1">가방</div>
        {grouped.length === 0 ? (
          <div className="text-amber-700 italic text-xs">비어 있음</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {grouped.map((entry) => {
              const item = items[entry.id];
              const label = formatGroupedItem(entry);
              return (
                <li key={entry.id} className="flex items-center justify-between gap-2">
                  <span>{label}</span>
                  {item?.kind === 'consumable' && (
                    <button
                      type="button"
                      onClick={() => onUseItem(entry.id)}
                      className="rounded bg-amber-700 text-amber-50 px-1.5 py-0.5 text-xs hover:bg-amber-800"
                      title={item.desc}
                    >
                      사용
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* #351/v3 — 플레이 옵션 */}
      <PlayOptionsSection />
    </aside>
  );
}
