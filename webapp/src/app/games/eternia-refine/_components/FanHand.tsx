'use client';

// 부채꼴 손패 (#419) — 두 라우트가 함께 쓴다. UI 는 비교 대상이 아니라 한 벌만 둔다.
//
// 세로 화면에 카드 다섯 장을 넣는 방법. 가로 스크롤 스트립으로 두면 **드래그가 스크롤과
// 싸운다** — 카드를 위로 끌어 내려는 손짓이 목록을 옆으로 밀어 버린다. 겹쳐 놓으면
// 스크롤이 사라지고 그 충돌도 함께 사라진다.
//
// 조작:
//   1. 누른다        — 그 카드가 올라오고 본문이 보인다
//   2. 좌우로 쓴다   — 손가락 밑 카드가 차례로 올라온다 (손을 떼지 않고 훑는다)
//   3. 위로 끈다     — DRAG_THRESHOLD 를 넘으면 낼 준비가 된다
//   4. 도로 내린다   — 제자리로
//
// ── 폭 계산 (처음에 여기서 틀렸다) ──────────────────────────────────
//
// 회전 피벗이 카드 **아래쪽**에 있어서(부채 손잡이), 회전은 카드를 옆으로도 밀어낸다.
// 그 이동량 `PIVOT_BELOW × sin(각도)` 를 안 세는 바람에 412px 기기에서 부채가 좌우로
// 잘렸다. 그래서 간격·각도를 상수로 두지 않고 **컨테이너 폭에서 역산**한다.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '@/lib/eternia-refine/types';

/** 위로 이만큼 끌면 낸다. 짧으면 오발이 나고 길면 답답하다. */
const DRAG_THRESHOLD = -96;

/** 이만큼 위로 끌기 전까지는 좌우 훑기로 본다. */
const SCRUB_UNTIL = -18;

const CARD_W = 100;
const CARD_H = 144;

/** 카드 중심에서 회전 피벗까지의 거리. 클수록 부채가 넓게 펴진다. */
const PIVOT_BELOW = 150;

/**
 * 카드 한 장당 기울기. 바깥 카드는 이것의 (n−1)/2 배까지 눕는다.
 * 13 으로 뒀더니 5장에서 바깥이 26° 라 카드 이름이 안 읽혔다 — 7 이면 14° 다.
 */
const MAX_SPREAD_DEG = 7;
const LIFT_PX = -44;
const EDGE_PAD = 10;

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * 컨테이너 폭에 맞는 부채 각도·간격을 구한다.
 *
 * 가장 바깥 카드가 차지하는 가로 반폭 = 회전한 카드의 반폭 + 피벗이 밀어낸 거리 + 간격.
 * 이것이 `폭/2 − 여백` 을 넘지 않게 각도부터 줄이고, 그래도 안 되면 간격을 줄인다.
 */
export function fanGeometry(width: number, n: number) {
  if (n <= 1) return { spread: 0, gap: 0, drop: 0, height: CARD_H };
  const maxOffset = (n - 1) / 2;
  const budget = width / 2 - EDGE_PAD;

  const pick = (deg: number, gap: number) => ({ spread: deg, gap, ...vertical(deg * maxOffset) });

  for (let deg = MAX_SPREAD_DEG; deg >= 0; deg -= 0.5) {
    const rot = rad(deg * maxOffset);
    const halfRotated = (CARD_W * Math.cos(rot) + CARD_H * Math.sin(rot)) / 2;
    const pivotPush = PIVOT_BELOW * Math.sin(rot);
    const room = budget - halfRotated - pivotPush;
    if (room <= 0) continue;
    const gap = Math.min(46, room / maxOffset);
    if (gap >= 16) return pick(deg, gap);
  }
  // 아주 좁은 화면 — 회전 없이 최소 간격으로 겹친다.
  return pick(0, Math.max(8, (budget - CARD_W / 2) / maxOffset));
}

/**
 * 회전이 카드를 얼마나 아래로 끌어내리나.
 *
 * 피벗이 카드 밖(아래)에 있어서, 회전하면 아래 모서리가 원래 밑변보다 더 내려간다.
 * 이걸 안 세면 카드가 손패 상자를 뚫고 나가 아래 버튼을 덮고 페이지가 늘어난다 —
 * 실제로 그랬다(30px 삐져나옴).
 *
 * 밑변의 피벗 기준 높이 `b = CARD_H/2 − PIVOT_BELOW` 일 때
 *   내려간 양 = (CARD_W/2)·sinθ + |b|·(1 − cosθ)
 */
function vertical(maxDeg: number) {
  const rot = rad(maxDeg);
  const b = PIVOT_BELOW - CARD_H / 2;
  const drop = Math.ceil((CARD_W / 2) * Math.sin(rot) + b * (1 - Math.cos(rot)));
  return { drop, height: CARD_H + drop };
}

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
  const [width, setWidth] = useState(360);
  const dragging = useRef(false);
  const startY = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);

  // 폭이 바뀌면 부채를 다시 편다 — 회전으로 화면을 넘지 않게.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  const { spread, gap, drop, height } = fanGeometry(width, n);

  return (
    <div
      ref={root}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ height }}
      className="relative w-full shrink-0 touch-none select-none"
      aria-label="손패"
    >
      {armed && (
        <div className="pointer-events-none absolute inset-x-0 -top-10 z-[70] flex justify-center">
          <span className="rounded-md border-2 border-amber-700 bg-amber-100/95 px-4 py-2 text-sm font-bold text-amber-800">
            놓으면 낸다
          </span>
        </div>
      )}

      {hand.map((card, i) => {
        const off = i - center;
        const isSel = i === sel;
        const playable = canPlay(card);
        // 호(arc)는 회전 피벗이 만들어 준다 — y 를 따로 더하면 아래로 삐져나간다.
        const transform = isSel
          ? `translate(${off * gap}px, ${dy || LIFT_PX}px) rotate(0deg) scale(1.06)`
          : `translate(${off * gap}px, 0px) rotate(${off * spread}deg)`;

        return (
          <button
            key={card.id}
            ref={(el) => {
              cards.current[i] = el;
            }}
            type="button"
            disabled={disabled}
            style={{
              width: CARD_W,
              height: CARD_H,
              marginLeft: -CARD_W / 2,
              bottom: drop,
              transform,
              transformOrigin: `50% ${PIVOT_BELOW + CARD_H / 2}px`,
              zIndex: isSel ? 60 : i,
            }}
            onClick={() => {
              if (!dragging.current && playable) onPlay(i);
            }}
            className={[
              'absolute left-1/2 flex flex-col gap-1 overflow-hidden rounded-md border p-2 text-left',
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
            <span className="text-[12px] font-bold leading-tight">{card.name}</span>
            <span
              className={[
                'overflow-hidden text-[10px] leading-snug transition-opacity duration-150 motion-reduce:transition-none',
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
