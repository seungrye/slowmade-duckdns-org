'use client';

// 띠 + 자세히 (#475) — Overview + Detail.
//
// ── 왜 이 모양인가 ──────────────────────────────────────────────────
//
// 「전체를 보면서 하나를 자세히」는 오래된 문제고 갈래가 셋이다(Cockburn 2007):
// **Overview+Detail**(영역을 둘로 나눈다) · **Zooming** · **Focus+Context**(한 화면에서
// 초점만 부풀린다).
//
// 부채는 셋 중 Focus+Context 다 — 고른 카드가 커지고 이웃이 `SCATTER_MAX` 만큼 비킨다.
// 그런데 이 갈래엔 알려진 함정이 있다: macOS Dock 의 fisheye 확대가 **「대상을 움직여
// 조준을 방해한다」**는 연구가 배포 뒤에 나왔다. 손패도 같은 일을 한다.
//
// 그래서 여기서는 **띠가 절대 움직이지 않는다.** 고른 토큰만 7px 뜨고 이웃은 제자리다.
// 바뀌는 것은 위의 자세히 칸뿐이다.
//
// ── 호는 남기고 겹침만 버린다 ───────────────────────────────────────
//
// 부채의 호 자체는 근거가 있다 — 엄지는 손목에 매여 **호를 그린다**(thumb zone).
// 근거가 없는 것은 **겹침**이다. 좁은 화면에 카드를 크게 그리려다 생긴 것이고, 그 대가로
// 침식 값이 4/5·7/8 가려졌다. 그래서 호는 남기고(`ARC`) 겹침만 버린다.
//
// 토큰이 작아진 만큼 **문양이 필요하다** — 44px 안에서 이름은 못 읽어도 인장은 알아본다.

import { useEffect, useRef, useState } from 'react';
import type { Card } from '@/lib/eternia-refine/types';
import type { Face } from '@/lib/eternia-refine/ui-variant';
import { EffectMarks } from './EffectMarks';
import { Sigil } from './Sigil';

/** 토큰 한 변 — 터치 규칙(44px)을 지키는 최솟값이다. 더 줄이지 말 것. */
const TOKEN_W = 44;

/** 가운데 토큰이 가장자리보다 이만큼 높다 — 엄지가 그리는 호. */
const ARC = 9;

/** 고른 토큰이 뜨는 높이. 이웃은 안 움직인다. */
const LIFT = 7;

/** 위로 이만큼 끌면 낸다. 부채와 같은 값이라 손이 배운 것을 다시 안 배운다. */
const DRAG_THRESHOLD = -84;

/** 이만큼 위로 끌기 전까지는 좌우로 고르는 중이다. */
const SCRUB_UNTIL = -18;

export interface HandRailProps {
  hand: Card[];
  canPlay: (card: Card) => boolean;
  onPlay: (index: number) => void;
  disabled?: boolean;
  /** 토큰에 무엇을 그릴지. `plain` 이면 비용과 이름만이라 알아보기 어렵다. */
  face?: Face;
  reason?: (card: Card) => string;
}

export function HandRail({
  hand,
  canPlay,
  onPlay,
  disabled,
  face = 'sigil',
  reason = (c) => (c.kind === 'crystal' ? '결정은 낼 수 없다' : '지금은 낼 수 없다'),
}: HandRailProps) {
  const [sel, setSel] = useState(-1);
  const [dy, setDy] = useState(0);
  const [over, setOver] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const row = useRef<HTMLDivElement>(null);
  /**
   * 고른 번호와 「문턱을 넘었나」를 **ref 로도** 들고 있는다.
   *
   * `pointermove` 는 리렌더 사이에 여러 번 오므로 핸들러가 보는 상태는 한 박자 늦다.
   * 빠르게 끌면 `up()` 이 아직 false 인 `over` 를 보고 카드를 안 낸다 —
   * 부채에서 실제로 그렇게 깨졌다(e2e 가 잡았다). 이벤트가 상태보다 빠르다.
   */
  const selRef = useRef(-1);
  const overRef = useRef(false);

  const n = hand.length;
  const picked = sel >= 0 ? hand[sel] : null;
  const armed = over && Boolean(picked) && canPlay(picked!);

  useEffect(() => {
    selRef.current = -1;
    overRef.current = false;
    setSel(-1);
    setDy(0);
    setOver(false);
  }, [hand]);

  /**
   * 손가락 밑 토큰 — **실제 자리에서** 고른다.
   *
   * 부채는 쉬는 자리를 계산해 골랐다(이웃이 흩어져 위치가 움직이니까). 여기서는
   * 아무것도 안 움직이므로 실측이 곧 정답이고, 계산이 필요 없다.
   */
  const indexAt = (clientX: number): number => {
    const el = row.current;
    if (!el || n === 0) return -1;
    const tokens = [...el.querySelectorAll<HTMLElement>('[data-token]')];
    if (tokens.length === 0) return -1;
    let best = 0;
    let bestDist = Infinity;
    tokens.forEach((t, i) => {
      const b = t.getBoundingClientRect();
      const d = Math.abs(clientX - (b.left + b.width / 2));
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    const i = indexAt(e.clientX);
    if (i < 0) return;
    dragging.current = true;
    startY.current = e.clientY;
    selRef.current = i;
    overRef.current = false;
    setSel(i);
    setDy(0);
    setOver(false);
    row.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientY - startY.current;

    // 위로 안 끌었으면 좌우로 고르는 중 — 띠를 쓸면 차례로 바뀐다.
    if (delta > SCRUB_UNTIL) {
      const i = indexAt(e.clientX);
      if (i >= 0 && i !== selRef.current) {
        selRef.current = i;
        setSel(i);
        startY.current = e.clientY;
      }
      setDy(Math.min(0, delta));
      overRef.current = false;
      setOver(false);
      return;
    }
    setDy(delta);
    overRef.current = delta < DRAG_THRESHOLD;
    setOver(overRef.current);
  };

  const up = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const i = selRef.current;
    const shouldPlay = overRef.current && i >= 0 && hand[i] && canPlay(hand[i]);
    overRef.current = false;
    setDy(0);
    setOver(false);
    if (shouldPlay) onPlay(i);
  };

  return (
    <>
      {/* ── 자세히 — 바뀌는 것은 여기뿐이다 ───────────────────── */}
      <div className="mt-2 flex min-h-[92px] shrink-0 items-start gap-2 rounded-md border border-amber-300 bg-amber-100/50 p-2.5">
        {picked ? (
          <>
            {face === 'sigil' && <Sigil card={picked} size={52} className="mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <b className="block text-[15px] leading-tight">{picked.name}</b>
              <span className="mt-0.5 block font-mono text-[11px] text-amber-800">
                에테르 {picked.cost === null ? '—' : picked.cost}
                {picked.erosion > 0 ? ` · 침식 +${picked.erosion}` : ' · 침식 없음'}
              </span>
              <span className="mt-1 block text-[12.5px] leading-snug text-amber-900">
                {picked.text}
              </span>
            </div>
            <button
              type="button"
              disabled={disabled || !canPlay(picked)}
              onClick={() => onPlay(sel)}
              className="min-h-[44px] shrink-0 self-center rounded-md bg-amber-700 px-4 text-sm font-bold text-amber-50 hover:bg-amber-800 disabled:bg-amber-200 disabled:text-amber-800"
            >
              {canPlay(picked) ? '낸다' : reason(picked)}
            </button>
          </>
        ) : (
          <span className="self-center text-[12.5px] text-amber-800">
            아래 띠에서 고르면 여기 펼쳐진다. 쓸어서 넘겨도 된다.
          </span>
        )}
      </div>

      {/* ── 띠 — 여섯이든 여덟이든 겹치지 않는다 ───────────────── */}
      <div
        ref={row}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ paddingTop: ARC + LIFT }}
        className="relative flex w-full shrink-0 touch-none select-none items-end justify-center gap-1.5 pb-1"
        aria-label="손패"
      >
        {over && picked && (
          <div className="pointer-events-none absolute inset-x-0 -top-2 z-[70] flex justify-center">
            <span
              className={[
                'rounded-md border-2 px-4 py-2 text-sm font-bold',
                armed
                  ? 'border-amber-700 bg-amber-100/95 text-amber-800'
                  : 'border-rose-700 bg-rose-50 text-rose-700',
              ].join(' ')}
            >
              {armed ? '놓으면 낸다' : reason(picked)}
            </span>
          </div>
        )}

        {hand.map((card, i) => {
          const isSel = i === sel;
          const t = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
          // 호는 남긴다. 고른 것만 뜨고 **이웃은 제자리다.**
          // 끌고 있으면 손가락을 따라가되, 띠가 위 칸을 덮지 않게 26px 에서 멈춘다.
          const arcY = -ARC * (1 - t * t);
          const y = arcY + (isSel ? -LIFT + Math.max(dy, -26) : 0);
          const playable = canPlay(card);

          return (
            <button
              key={card.id}
              type="button"
              data-token
              disabled={disabled}
              onClick={() => setSel(i)}
              style={{ width: TOKEN_W, transform: `translateY(${y.toFixed(1)}px)` }}
              className={[
                'flex min-h-[52px] shrink-0 flex-col items-center gap-0.5 rounded-md border px-0.5 pb-1 pt-1',
                'transition-transform duration-150 ease-out motion-reduce:transition-none',
                isSel ? 'border-2 border-amber-700 shadow-md' : 'shadow-sm',
                card.kind === 'crystal'
                  ? 'border-slate-300 bg-slate-100'
                  : card.kind === 'stigma'
                    ? 'border-amber-800 bg-amber-100'
                    : 'border-amber-300 bg-amber-50',
                !playable ? 'opacity-55' : '',
              ].join(' ')}
            >
              <span
                className={`font-mono text-[12px] font-semibold leading-none ${
                  card.kind === 'crystal' ? 'text-slate-400' : 'text-amber-700'
                }`}
              >
                {card.cost === null ? '—' : card.cost}
              </span>
              {face === 'sigil' ? (
                <Sigil card={card} size={28} />
              ) : face === 'index' ? (
                <EffectMarks card={card} size={8.5} />
              ) : null}
              <span className="w-full truncate text-center text-[8px] leading-tight text-amber-900/80">
                {card.name}
              </span>
              {card.erosion > 0 && (
                <span className="font-mono text-[8px] font-semibold leading-none text-slate-600">
                  +{card.erosion}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
