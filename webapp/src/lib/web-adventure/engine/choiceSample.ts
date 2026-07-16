// 선택지 표시 추림 — 씬은 최대 6개까지 저작하되(pool), 화면엔 3개만 노출한다.
// 3개를 회차(runIndex)+씬 id 로 *결정적* 추첨해, 한 회차 안에선 고정(새로고침·리렌더에
// 안정 → 리롤 악용 방지)이고 회차가 바뀌면 다른 조합이 나온다(반복 플레이 요인).
//
// 소프트락 방지 원칙:
//   - "항상 노출(keep)": pinned=true 이거나 plain 이 아닌 분기(conditional/probability).
//     → 해금·도전·핵심 분기는 랜덤으로 가려지지 않는다.
//   - 추첨 대상: non-pinned plain(주로 flavor/서브 분기)뿐. 남는 칸(max − keep)만 채운다.
//   - keep 이 max 를 넘으면 keep 전부 노출(핵심 분기를 숨기지 않는다).

import type { Character, Choice } from "@/types/web-adventure";
import { isChoiceVisible } from "./choiceFilter";

/** 문자열 → 32bit 비음수 해시 (결정적 seed 용). SceneRenderer 의 것과 동일 규칙. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * (seed, id) → 추첨 점수. 약한 다항 해시는 seed 를 접두어로 붙여도 id 끝글자 순서가
 * 그대로 남아 seed 를 바꿔도 순위가 안 변한다. seed·id 해시를 곱셈 기반으로 섞어
 * avalanche 를 확보 → seed 가 바뀌면 순위가 실제로 재배열된다.
 */
function scoreOf(seed: string, id: string): number {
  const a = hashString(seed);
  const b = hashString(id);
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2f, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = h ^ (h >>> 13);
  return h >>> 0;
}

function isAlwaysShown(c: Choice): boolean {
  return c.pinned === true || c.kind !== "plain";
}

export type PickOptions = {
  /** 결정적 추첨 seed. 보통 `${runIndex}:${sceneId}`. */
  seed: string;
  /** 화면 표시 상한. 기본 3. */
  max?: number;
};

/**
 * 화면에 보일 선택지 선택 — 캐릭터 상태로 visible 필터 후, 상한 초과 시 결정적 추첨.
 * 최종 결과는 원저작 순서를 유지한다.
 */
export function pickDisplayedChoices(
  choices: Choice[],
  character: Character,
  opts: PickOptions,
): Choice[] {
  const max = opts.max ?? 3;
  const visible = choices.filter((c) => isChoiceVisible(c, character));
  if (visible.length <= max) return visible;

  const order = new Map(visible.map((c, i) => [c.id, i]));
  const keep = visible.filter(isAlwaysShown);
  const pool = visible.filter((c) => !isAlwaysShown(c));

  const remaining = Math.max(0, max - keep.length);
  const sampled =
    remaining > 0
      ? pool
          .map((c) => ({ c, r: scoreOf(opts.seed, c.id) }))
          .sort((a, b) => (a.r - b.r) || (a.c.id < b.c.id ? -1 : 1))
          .slice(0, remaining)
          .map((x) => x.c)
      : [];

  return [...keep, ...sampled].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}
