// 카드 문양 (#475) — 순수 기하. 난수 없음.
//
// ── 왜 그림이 필요한가 ──────────────────────────────────────────────
//
// 겹친 손패에서 카드를 알아보는 것은 글자가 아니라 **그림**이다. Slay the Spire 에서
// 「타격」을 읽는 사람은 없다 — 그림을 본다. 이 게임의 카드에는 그 그림이 없어서
// 이름을 읽어야 하고, 이름은 겹치면 가려진다(실측: 8장일 때 7/8 가림).
//
// ── 왜 그려 넣지 않고 계산하나 ──────────────────────────────────────
//
// `Card` 의 효과가 **전부 숫자 필드**다 — `damage · block · heal · draw · soothe ·
// erosion · exhaust`. 그 숫자를 기하로 바꾸면 그림 파일이 한 장도 필요 없고, 새 카드를
// 넣으면 문양도 저절로 생긴다. `text` 는 그 숫자를 풀어 쓴 산문일 뿐이라 **문양이
// 산문보다 정확하다** — 실제로 「현장 정제」는 `block: 3` 인데 문구에 방어가 없다.
//
// 방식은 RPG Maker 쪽 Sigil Core 의 것을 옮겼다: 「피해 종류가 도형 계열을 고르고,
// 범위가 배치를 고르고, 판정 방식이 선의 성격을 고른다」, 그리고 `Math.random()` 을
// 쓰지 않아 **같은 카드는 언제나 같은 인장**이 된다.
//
// 그리고 이 게임의 카드는 말 그대로 **성흔(聖痕), 몸에 새겨진 표식**이다 —
// 장식이 아니라 설정이 시킨 그림이다.
//
// 결정과 계산만 여기 있고 SVG 는 `_components/Sigil.tsx` 가 그린다.

import type { Card } from './types';

/** 가운데 도형 계열 — 주효과가 고른다. */
export type CoreKind =
  | 'blade' /** 피해 — 아래를 향한 삼각 */
  | 'ward' /** 방어 — 육각 겹침 */
  | 'vessel' /** 회복 — 그릇 */
  | 'spring' /** 침식 감소 — 물결 */
  | 'lattice' /** 결정을 자원으로 — 겹친 마름모 */
  | 'crystal' /** 굳은 결정 — 갈라진 마름모 */
  | 'mark'; /** 그 외 — 점 하나 */

export interface SigilSpec {
  core: CoreKind;
  /** 전체 회전(라디안). 이름 해시라 카드마다 다르고 늘 같다. */
  rot: number;
  /** 바깥 띠 — 손을 벗어나는 효과(뽑기·소멸)가 있을 때만. */
  band: { dashed: boolean; satellites: number } | null;
  /** 침식 눈금 수. 클수록 촘촘하다 — **보기만 해도 위험한** 카드가 된다. */
  ticks: number;
  /** 기본 테. 성흔은 두 겹, 결정은 끊긴다. */
  rim: { double: boolean; dashed: boolean };
  /** 비용의 살. 0이면 살 대신 바깥 점선테를 둔다. */
  spokes: number;
  tone: 'stigma' | 'tool' | 'crystal';
}

/** 눈금 상한 — 침식 100 짜리가 와도 테두리가 검게 뭉개지지 않게. */
export const MAX_TICKS = 14;

/** 살 상한 — 비용이 아무리 커도 가운데가 안 보이면 안 된다. */
export const MAX_SPOKES = 8;

/** 침식 몇 당 눈금 하나인가. */
const EROSION_PER_TICK = 2.5;

/**
 * 이름에서 나오는 회전각 — **난수가 아니라 해시**다.
 *
 * 같은 이름이면 늘 같은 각이라 저장·복원·서버렌더에 걸쳐 문양이 안 흔들린다.
 */
export function spin(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ((h % 360) * Math.PI) / 180;
}

/** 주효과가 도형을 고른다. 순서가 곧 우선순위다. */
export function coreOf(card: Card): CoreKind {
  if (card.kind === 'crystal') return 'crystal';
  if (card.damage || card.scaling) return 'blade';
  if (card.blockPerCrystal) return 'lattice';
  if (card.block) return 'ward';
  if (card.heal) return 'vessel';
  if (card.soothe) return 'spring';
  return 'mark';
}

/** 카드 하나의 문양. 같은 카드는 언제나 같은 값. */
export function sigilSpec(card: Card): SigilSpec {
  const reach = (card.draw ?? 0) + (card.exhaust ? 1 : 0);
  const cost = card.cost ?? 0;

  return {
    core: coreOf(card),
    rot: spin(card.name),
    band: reach > 0 ? { dashed: Boolean(card.exhaust), satellites: card.draw ?? 0 } : null,
    ticks: Math.min(MAX_TICKS, Math.round(card.erosion / EROSION_PER_TICK)),
    rim: { double: card.kind === 'stigma', dashed: card.kind === 'crystal' },
    spokes: Math.min(MAX_SPOKES, cost),
    tone: card.kind === 'crystal' ? 'crystal' : card.kind === 'stigma' ? 'stigma' : 'tool',
  };
}

/** 중심 (50,50) 에서 각도 a·반지름 r 의 점. 12시가 0. */
export function pointAt(a: number, r: number): [number, number] {
  return [50 + r * Math.cos(a - Math.PI / 2), 50 + r * Math.sin(a - Math.PI / 2)];
}

/** 정n각형의 points 속성. */
export function polygonPoints(n: number, r: number, rot = 0): string {
  return Array.from({ length: n }, (_, i) =>
    pointAt(rot + (i * Math.PI * 2) / n, r)
      .map((v) => v.toFixed(1))
      .join(','),
  ).join(' ');
}
