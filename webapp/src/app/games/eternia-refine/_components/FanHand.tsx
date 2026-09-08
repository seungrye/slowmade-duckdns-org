'use client';

// 부채꼴 손패 (#419) — 두 라우트가 함께 쓴다. UI 는 비교 대상이 아니라 한 벌만 둔다.
//
// 세로 화면에 카드 다섯 장을 넣는 방법. 가로 스크롤 스트립으로 두면 **드래그가 스크롤과
// 싸운다** — 카드를 위로 끌어 내려는 손짓이 목록을 옆으로 밀어 버린다. 겹쳐 놓으면
// 스크롤이 사라지고 그 충돌도 함께 사라진다.
//
// 조작 (프로토타입에서 손으로 확인한 것):
//   1. 누른다        — 그 카드가 올라오고 본문이 보인다
//   2. 좌우로 쓴다   — 손가락 밑 카드가 차례로 올라온다 (손을 떼지 않고 훑는다)
//   3. 위로 끈다     — DRAG_THRESHOLD 를 넘으면 낼 준비가 된다
//   4. 도로 내린다   — 제자리로
//
// 데스크톱에서는 마우스로 같은 동작이 되고, 클릭만으로도 낼 수 있다.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from '@/lib/eternia-refine/types';

/** 위로 이만큼 끌면 낸다. 짧으면 오발이 나고 길면 답답하다. */
const DRAG_THRESHOLD = -96;

/** 이만큼 위로 끌기 전까지는 좌우 훑기로 본다. */
const SCRUB_UNTIL = -18;

const SPREAD_DEG = 7.5;
const GAP_PX = 46;
const ARC_PX = 7;
const LIFT_PX = -46;

export interface FanHandProps {
  hand: Card[];
  /** 낼 수 없는 카드는 올라오되 나가지 않는다 — 결정을 손으로 겪게 하려고. */
  canPlay: (card: Card) => boolean;
  onPlay: (index: number) => void;
  disabled?: boolean;
}

export function FanHand({ hand, canPlay, onPlay, disabled }: FanHandProps) {
  const [sel, setSel] = useState(-1);
  const [dy, setDy] = useState(0);
  const [armed, setArmed] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setSel(-1);
    setDy(0);
    setArmed(false);
  }, [hand]);

  const cardAt = useCallback((clientX: number) => {
    let best = -1;
    let bestD = Infinity;
    cards.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }, []);

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    const i = cardAt(e.clientX);
    if (i < 0) return;
    dragging.current = true;
    startY.current = e.clientY;
    setSel(i);
    setDy(0);
    setArmed(false);
    root.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientY - startY.current;

    // 위로 안 끌었으면 좌우 훑기 — 손가락 밑 카드로 갈아탄다.
    if (delta > SCRUB_UNTIL) {
      const i = cardAt(e.clientX);
      if (i >= 0 && i !== sel) {
        setSel(i);
        startY.current = e.clientY;
        setDy(0);
        setArmed(false);
        return;
      }
      setDy(Math.min(0, delta));
      setArmed(false);
      return;
    }
    setDy(delta);
    setArmed(delta < DRAG_THRESHOLD);
  };

  const up = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const i = sel;
    const shouldPlay = armed;
    setDy(0);
    setArmed(false);
    if (shouldPlay && i >= 0 && hand[i] && canPlay(hand[i])) onPlay(i);
  };

  const n = hand.length;
  const center = (n - 1) / 2;

  return (
    <div
      ref={root}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="relative h-[212px] touch-none select-none"
      aria-label="손패"
    >
      {armed && (
        <div className="pointer-events-none absolute inset-x-0 -top-16 flex justify-center">
          <span className="rounded-md border-2 border-amber-700 bg-amber-100/90 px-4 py-2 text-sm font-bold text-amber-800">
            놓으면 낸다
          </span>
        </div>
      )}

      {hand.map((card, i) => {
        const off = i - center;
        const isSel = i === sel;
        const playable = canPlay(card);
        const transform = isSel
          ? `translate(${off * GAP_PX}px, ${Math.abs(off) ** 2 * ARC_PX + (dy || LIFT_PX)}px) rotate(0deg) scale(1.08)`
          : `translate(${off * GAP_PX}px, ${Math.abs(off) ** 2 * ARC_PX}px) rotate(${off * SPREAD_DEG}deg)`;

        return (
          <button
            key={card.id}
            ref={(el) => {
              cards.current[i] = el;
            }}
            type="button"
            disabled={disabled}
            style={{ transform, transformOrigin: '50% 190%', zIndex: isSel ? 60 : i }}
            onClick={() => {
              // 마우스 클릭만으로도 낼 수 있다 — 데스크톱에서 끌지 않아도 되게.
              if (!dragging.current && playable) onPlay(i);
            }}
            className={[
              'absolute bottom-0 left-1/2 -ml-[52px] flex h-[150px] w-[104px] flex-col gap-1 rounded-md border p-2 text-left',
              'transition-transform duration-200 ease-out motion-reduce:transition-none',
              isSel ? 'shadow-lg' : 'shadow-sm',
              card.kind === 'crystal'
                ? 'border-slate-300 bg-slate-100 text-slate-500'
                : card.kind === 'stigma'
                  ? 'border-amber-800 bg-amber-100'
                  : 'border-amber-300 bg-amber-50',
              !playable && card.kind !== 'crystal' ? 'opacity-60' : '',
            ].join(' ')}
          >
            <span className="flex justify-between font-mono text-[10px] font-semibold">
              <span className={card.kind === 'crystal' ? 'text-slate-400' : 'text-amber-700'}>
                {card.cost === null ? '—' : card.cost}
              </span>
              <span className="text-slate-500">{card.erosion > 0 ? `+${card.erosion}` : '—'}</span>
            </span>
            <span className="text-[12.5px] font-bold leading-tight">{card.name}</span>
            <span
              className={[
                'text-[10.5px] leading-snug transition-opacity duration-150 motion-reduce:transition-none',
                isSel ? 'opacity-100' : 'opacity-0',
                card.kind === 'crystal' ? 'text-slate-500' : 'text-amber-900',
              ].join(' ')}
            >
              {card.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
