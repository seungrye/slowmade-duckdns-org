'use client';

// StatusPanel - the Web Adventure's combined side status panel (#241).
//
// What it shows:
//   - the 6 stats (str/dex/int/cha/con/wis) as a label, a value and a bar (out of 18).
//   - HP progress plus maxHp.
//   - the ability's name plus a one-line description.
//   - the inventory (grouped, with a "use" button for consumables).
//   - rerolls (a button when canReroll and rerollsLeft > 0).
//   - the run (runIndex).
//
// On desktop it is the sidebar; on mobile it mounts inside MobileDrawer (from #242).
// It absorbs InventoryStrip's inventory, HP and reroll logic - the parent component mounts this panel alone.

import type { Character, StatKey } from '@/types/web-adventure';
import { stigmaTier, stigmaVars } from "@/lib/web-adventure/stigma-sense";
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
  onUseItem: (itemId: string) => void;
}

// Visualising the stigma contamination - stigma-sense (#370) as the single source (#397).
// This used to hold its own two lines of hard-coded 3-stage flavour (#259), which then diverged from the
// stigma-sense (5 stages, 4 senses) built later for the same feedback. This always-visible panel stayed stale and left
// contamination reading as 'a number'. The panel now uses the same senses as the scene body - felt through the body (hand) and the mind.
const TIER_BAR: Record<number, string> = {
  0: "bg-sky-400/60",
  1: "bg-sky-500/70",
  2: "bg-violet-500/70",
  3: "bg-indigo-600/80",
  4: "bg-indigo-800/90 animate-pulse",
};

export default function StatusPanel({
  character,
  runIndex,
  onUseItem,
}: StatusPanelProps) {
  const ability = abilities[character.ability];
  const grouped = groupInventory(character.inventory);
  const hpPct = Math.max(0, Math.min(100, (character.hp / character.maxHp) * 100));
  const stigma = character.stigmaErosion;
  const tier = stigmaTier(stigma);
  const sense = stigmaVars(stigma); // { 침식_손, 침식_마음, … } - the same senses as the scene body
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
          className={`h-2 rounded overflow-hidden ${tier >= 3 ? "bg-indigo-200/70 ring-1 ring-indigo-400" : "bg-amber-200/60"}`}
        >
          <div
            className={`h-full ${TIER_BAR[tier]}`}
            style={{ width: `${stigmaPct}%` }}
            data-testid="stigma-bar"
            data-tier={tier}
          />
        </div>
        {tier >= 1 && (
          <div
            className={`text-[10px] italic mt-0.5 ${tier >= 3 ? "text-indigo-800 font-semibold" : "text-violet-800"}`}
            data-testid="stigma-sense"
          >
            <div>{sense.침식_손}</div>
            {tier >= 3 && <div className="mt-0.5">{sense.침식_마음}</div>}
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

      {/* 재굴림 잔여 횟수 (버튼은 판정 결과 화면에서). */}
      <div className="flex items-center justify-between mb-2 text-xs">
        <span>
          재굴림 <span className="font-mono font-bold">{character.rerollsLeft}</span>
        </span>
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
