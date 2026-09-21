'use client';

// 효과 도형 (#475) — 코너 인덱스 앞면이 쓴다.
//
// **이 게임엔 이미 이 어휘가 있다.** `IntentBadge`(GameClient) 가 적의 다음 수를
// ▲ 피해 · 🛡 방어 · ◆ 침식으로 그린다. 적의 수는 도형으로 보여 주면서 내 카드는
// 산문으로 보여 주던 것을, 같은 어휘로 맞춘다.
//
// 자리는 카드에서 **안 가려지는 왼쪽 띠**다(실측 34~54px). 거기 세로로 쌓으면
// 겹친 손패에서도 전부 읽힌다 — 1864년 트럼프가 모서리에 숫자를 넣은 것과 같은 수다.

import type { Card } from '@/lib/eternia-refine/types';

type Kind = 'damage' | 'block' | 'heal' | 'soothe' | 'draw' | 'erosion';

const PATH: Record<Kind, string> = {
  damage: 'M3 3 L21 3 L12 21 Z',
  block: 'M12 2 L20 5 V12 C20 16.4 16.4 19.8 12 22 C7.6 19.8 4 16.4 4 12 V5 Z',
  heal: 'M12 21 C12 21 3 14.5 3 8.6 A4.6 4.6 0 0 1 12 6.6 A4.6 4.6 0 0 1 21 8.6 C21 14.5 12 21 12 21 Z',
  soothe: 'M3 12 Q7.5 5 12 12 T21 12',
  draw: 'M6 3 H15 L19 7 V21 H6 Z',
  erosion: 'M12 1.5 L19.5 12 L12 22.5 L4.5 12 Z',
};

const TONE: Record<Kind, string> = {
  damage: 'text-rose-700',
  block: 'text-amber-700',
  heal: 'text-emerald-700',
  soothe: 'text-sky-700',
  draw: 'text-amber-900/70',
  erosion: 'text-slate-600',
};

/** 카드의 숫자 필드를 도형 줄로. `text` 를 안 읽으므로 산문과 어긋날 수 없다. */
export function marksOf(card: Card): { kind: Kind; label: string }[] {
  const out: { kind: Kind; label: string }[] = [];
  const dmg = card.damage ?? 0;
  if (dmg) out.push({ kind: 'damage', label: card.scaling ? `${dmg}+` : String(dmg) });
  else if (card.scaling) out.push({ kind: 'damage', label: '?' });
  if (card.block) out.push({ kind: 'block', label: String(card.block) });
  if (card.blockPerCrystal) out.push({ kind: 'block', label: `${card.blockPerCrystal}×` });
  if (card.heal) out.push({ kind: 'heal', label: String(card.heal) });
  if (card.soothe) out.push({ kind: 'soothe', label: `-${card.soothe}` });
  if (card.draw) out.push({ kind: 'draw', label: `+${card.draw}` });
  if (card.erosion) out.push({ kind: 'erosion', label: String(card.erosion) });
  return out;
}

export interface EffectMarksProps {
  card: Card;
  /** 세로로 쌓을지(부채의 왼쪽 띠) 가로로 둘지(넓은 자리). */
  direction?: 'column' | 'row';
  /** 글자 크기 px. 좁은 자리일수록 작게. */
  size?: number;
}

export function EffectMarks({ card, direction = 'column', size = 10 }: EffectMarksProps) {
  const marks = marksOf(card);

  // 숫자가 하나도 없는 카드(결정·순수 서사)는 「눌러 읽어라」를 점으로 알린다.
  if (marks.length === 0) {
    return (
      <span className="font-mono leading-none text-amber-800/50" style={{ fontSize: size }}>
        ···
      </span>
    );
  }

  return (
    <span
      className={`flex ${direction === 'column' ? 'flex-col items-start' : 'flex-row items-center'} gap-[2px]`}
    >
      {marks.map((m, i) => (
        <span
          key={`${m.kind}-${i}`}
          className={`flex items-center gap-[1px] font-mono font-semibold leading-none ${TONE[m.kind]}`}
          style={{ fontSize: size }}
        >
          <svg
            viewBox="0 0 24 24"
            width={size * 0.9}
            height={size * 0.9}
            fill={m.kind === 'soothe' ? 'none' : 'currentColor'}
            stroke={m.kind === 'soothe' ? 'currentColor' : 'none'}
            strokeWidth={m.kind === 'soothe' ? 3 : 0}
            className="shrink-0"
            aria-hidden="true"
          >
            <path d={PATH[m.kind]} />
          </svg>
          {m.label}
        </span>
      ))}
    </span>
  );
}
