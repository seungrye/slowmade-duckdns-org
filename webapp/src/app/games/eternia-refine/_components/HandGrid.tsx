'use client';

// 격자 손패 (#475).
//
// 겹치기를 아예 그만둔다. **모든 카드의 본문이 원문 그대로 보이는 유일한 배치**다 —
// 도형으로 줄인 숫자가 아니라 문장 그대로.
//
// #419 가 「안 겹치는 손패」를 버린 이유는 **끌기가 가로 스크롤과 싸운다**는 것이었는데,
// 그건 스크롤 스트립 얘기다. **두 줄 격자는 스크롤이 없다** — 그 반대 근거가 여기엔
// 적용되지 않는다. 실측으로도 들어간다(412px·8장에서 필요한 높이 123px, 남는 공백 293px).
//
// 값은 **위계가 없다는 것**이다. 여섯 개의 글상자로 읽히기 쉬워서, 문양 앞면과 같이 쓸 때
// 제일 낫다.
//
// 손짓은 **탭=고르기, 한 번 더=내기**다. 탭이 곧 제출이 아니라는 지금의 안전장치를
// 그대로 옮긴 것이다 — 격자는 버튼이 촘촘해 오발이 더 쉽다.

import { useEffect, useRef, useState } from 'react';
import type { Card } from '@/lib/eternia-refine/types';
import type { Face } from '@/lib/eternia-refine/ui-variant';
import { EffectMarks } from './EffectMarks';
import { Sigil } from './Sigil';

/** 이 장수를 넘으면 네 칸으로 — 여덟 장까지 두 줄에 담는다. */
const WIDE_AT = 7;

export interface HandGridProps {
  hand: Card[];
  canPlay: (card: Card) => boolean;
  onPlay: (index: number) => void;
  disabled?: boolean;
  face?: Face;
  reason?: (card: Card) => string;
}

export function HandGrid({
  hand,
  canPlay,
  onPlay,
  disabled,
  face = 'plain',
  reason = (c) => (c.kind === 'crystal' ? '결정은 낼 수 없다' : '지금은 낼 수 없다'),
}: HandGridProps) {
  const [sel, setSel] = useState(-1);
  /**
   * 고른 번호를 **ref 로도** 들고 있는다.
   *
   * 「한 번 더 누르면 낸다」는 두 번째 click 이 첫 번째의 `setSel` 을 본다는 전제인데,
   * 두 클릭이 붙어 들어오면 두 번째 핸들러가 아직 `-1` 인 `sel` 을 본다 — 그러면 또
   * 고르기만 하고 영영 안 나간다. e2e 가 부하 걸릴 때 그렇게 잡았다.
   */
  const selRef = useRef(-1);

  useEffect(() => {
    selRef.current = -1;
    setSel(-1);
  }, [hand]);

  const cols = hand.length >= WIDE_AT ? 4 : 3;

  return (
    <div
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      className="grid w-full shrink-0 select-none gap-1.5 py-1"
      aria-label="손패"
    >
      {hand.map((card, i) => {
        const playable = canPlay(card);
        const isSel = i === sel;

        return (
          <button
            key={card.id}
            type="button"
            disabled={disabled}
            // 한 번은 고르기, 고른 것을 다시 누르면 낸다.
            onClick={() => {
              if (selRef.current === i && playable) {
                selRef.current = -1;
                onPlay(i);
                return;
              }
              selRef.current = i;
              setSel(i);
            }}
            className={[
              'flex min-h-[96px] flex-col gap-1 overflow-hidden rounded-md border p-1.5 text-left',
              'transition-colors motion-reduce:transition-none',
              isSel ? 'border-2 border-amber-700 shadow-md' : 'shadow-sm',
              card.kind === 'crystal'
                ? 'border-slate-300 bg-slate-100 text-slate-500'
                : card.kind === 'stigma'
                  ? 'border-amber-800 bg-amber-100'
                  : 'border-amber-300 bg-amber-50',
              !playable && card.kind !== 'crystal' ? 'opacity-60' : '',
            ].join(' ')}
          >
            <span className="flex items-center justify-between font-mono text-[10px] font-semibold">
              <span className={card.kind === 'crystal' ? 'text-slate-400' : 'text-amber-700'}>
                {card.cost === null ? '—' : card.cost}
              </span>
              <span className="text-slate-500">{card.erosion > 0 ? `+${card.erosion}` : '—'}</span>
            </span>

            {face === 'sigil' && <Sigil card={card} size={34} className="mx-auto" />}
            {face === 'index' && <EffectMarks card={card} direction="row" size={9.5} />}

            <span className="text-[11px] font-bold leading-tight">{card.name}</span>
            <span
              className={`overflow-hidden text-[9.5px] leading-snug ${
                card.kind === 'crystal' ? 'text-slate-500' : 'text-amber-900'
              }`}
            >
              {card.text}
            </span>

            {/* 고른 카드만 무엇이 일어날지 말한다 — 격자는 탭 두 번이라 확인이 필요하다. */}
            {isSel && (
              <span
                className={`mt-auto rounded-sm px-1 py-0.5 text-center text-[9.5px] font-bold ${
                  playable ? 'bg-amber-700 text-amber-50' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {playable ? '한 번 더 누르면 낸다' : reason(card)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
