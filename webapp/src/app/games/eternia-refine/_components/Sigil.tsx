'use client';

// 카드 인장 (#475).
//
// `sigilSpec` 의 결정을 SVG 로 옮기기만 한다 — 어느 도형을 쓸지·눈금이 몇 개일지는
// 전부 `lib/eternia-refine/sigil.ts` 가 정했고 여기서는 그리기만 한다.
//
// 바깥에서 안으로 그린다(손으로 새기는 순서). 색은 계열에서 오고, 굵기는 성흔이 더 굵다 —
// 위험한 카드가 더 진하게 보이는 것이 이 문양의 요점이다.

import {
  pointAt,
  polygonPoints,
  sigilSpec,
  type CoreKind,
  type SigilSpec,
} from '@/lib/eternia-refine/sigil';
import type { Card } from '@/lib/eternia-refine/types';

/** 계열별 색 — 화면 전체의 팔레트와 같다(침식만 돌빛). */
const TONE: Record<SigilSpec['tone'], string> = {
  stigma: 'text-amber-700',
  tool: 'text-amber-600/90',
  crystal: 'text-slate-400',
};

const f = (n: number) => n.toFixed(1);

/** 가운데 도형. 주효과가 이미 골라 놨다. */
function core(kind: CoreKind, rot: number) {
  switch (kind) {
    case 'blade':
      return (
        <>
          <polygon points={polygonPoints(3, 19, rot + Math.PI)} />
          <path d="M50 34 L50 62" />
        </>
      );
    case 'ward':
      return (
        <>
          <polygon points={polygonPoints(6, 19, rot)} />
          <polygon points={polygonPoints(6, 11, rot)} />
        </>
      );
    case 'vessel':
      return (
        <>
          <path d="M36 40 H64 L59 62 Q50 68 41 62 Z" />
          <path d="M50 30 V44 M44 36 H56" />
        </>
      );
    case 'spring':
      return (
        <>
          <path d="M34 50 Q42 40 50 50 T66 50" />
          <circle cx="50" cy="50" r="19" />
        </>
      );
    case 'lattice':
      return (
        <>
          <polygon points={polygonPoints(4, 19, rot)} />
          <polygon points={polygonPoints(4, 19, rot + Math.PI / 4)} />
        </>
      );
    case 'crystal':
      return (
        <>
          <polygon points={polygonPoints(4, 20, rot)} />
          <path d="M50 30 L43 49 L55 55 L50 70" strokeWidth={2.2} />
        </>
      );
    default:
      return (
        <>
          <circle cx="50" cy="50" r="15" />
          <circle cx="50" cy="50" r="3" />
        </>
      );
  }
}

export interface SigilProps {
  card: Card;
  /** 한 변의 px. 띠 토큰은 30 안팎, 자세히 칸은 56 안팎. */
  size: number;
  className?: string;
}

export function Sigil({ card, size, className }: SigilProps) {
  const s = sigilSpec(card);
  const outer = s.band ? 46 : 42;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth={s.tone === 'stigma' ? 2.4 : s.tone === 'crystal' ? 1.6 : 1.9}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={`${TONE[s.tone]} ${className ?? ''}`}
      aria-hidden="true"
    >
      {/* 바깥 띠 — 손을 벗어나는 효과가 있을 때만. 소멸이면 끊긴다. */}
      {s.band && (
        <circle cx="50" cy="50" r="46" strokeDasharray={s.band.dashed ? '3 4' : undefined} />
      )}
      {s.band &&
        Array.from({ length: s.band.satellites }, (_, i) => {
          const [x, y] = pointAt(s.rot + (i * Math.PI * 2) / Math.max(1, s.band!.satellites), 46);
          return <circle key={i} cx={f(x)} cy={f(y)} r="3.6" fill="currentColor" stroke="none" />;
        })}

      {/* 침식 눈금 — 촘촘할수록 위험하다. */}
      {Array.from({ length: s.ticks }, (_, i) => {
        const a = s.rot + (i * Math.PI * 2) / s.ticks;
        const [x1, y1] = pointAt(a, 34);
        const [x2, y2] = pointAt(a, outer);
        return <path key={i} d={`M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}`} strokeWidth={2.6} />;
      })}

      {/* 기본 테 — 무엇이든 하나는 있다. */}
      <circle cx="50" cy="50" r="33" strokeDasharray={s.rim.dashed ? '6 5' : undefined} />
      {s.rim.double && <circle cx="50" cy="50" r="29" />}

      {/* 살 — 비용. 0이면 살 대신 점선테. */}
      {s.spokes > 0
        ? Array.from({ length: s.spokes }, (_, i) => {
            const a = s.rot + Math.PI / 6 + (i * Math.PI * 2) / s.spokes;
            const [x1, y1] = pointAt(a, s.rim.double ? 26 : 29);
            const [x2, y2] = pointAt(a, 40);
            return (
              <g key={i}>
                <path d={`M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}`} />
                <circle cx={f(x2)} cy={f(y2)} r="2.2" fill="currentColor" stroke="none" />
              </g>
            );
          })
        : <circle cx="50" cy="50" r="40" strokeDasharray="2 4" />}

      {core(s.core, s.rot)}
    </svg>
  );
}
