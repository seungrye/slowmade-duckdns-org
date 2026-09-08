// 엔딩 판정 — A안(별도 구현) (#419).
//
// **이 설계의 중심이다.** 마지막에 선택지를 띄우지 않는다. 회차를 끝낸 순간의 덱 상태를
// 읽어 엔딩이 정해진다. 그래서 상점에서 결정 3장을 판 것이 곧 승천 쪽으로 한 걸음이 되고,
// 모든 기계적 판단이 동시에 서사적 판단이 된다.
//
// 엔딩 목록은 `@/types/web-adventure` 의 것을 쓴다 — 자체 id 를 발명하면 나중에 회차를
// PastRun 으로 흘려보낼 때(피드백 노트) 번역 계층이 필요해진다. 그 문을 열어 두려는 것.

import type { EndingId } from '@/types/web-adventure';
import { EROSION_MAX } from './stigma';

/** 판정에 쓰는 회차 요약 — 화면·엔진 어느 쪽에도 기대지 않는 순수 입력. */
export interface RunSummary {
  /** 최종 침식. */
  erosion: number;
  /** 덱에 남은 결정 수. */
  crystalsLeft: number;
  /** 정제해 판 결정의 누계. */
  refined: number;
  /** 회차 동안 만들어진 결정의 총수 (= 남은 것 + 판 것). */
  crystalsEverMade: number;
  /** 판 결정이 키운 부유도시. */
  cityPower: number;
  /** 덱의 세계수 카드 수. */
  sylvanCards: number;
  /** 손잡은 세력. 슬라이스에서는 아직 고르지 않으므로 보통 null. */
  ally: 'ironguard' | 'priesthood' | 'sylvan' | null;
  /** 회차를 끝까지 갔는가. false 면 도중에 죽은 것. */
  cleared: boolean;
}

/** 부유도시가 이만큼 자라면 떨어진다. */
export const CITY_COLLAPSE_AT = 9;

/** 덱이 숲이 되었다고 볼 기준. */
export const SYLVAN_DECK_AT = 8;

/**
 * 덱 상태를 읽어 엔딩을 정한다.
 *
 * **순서가 규칙이다.** 위에서부터 먼저 걸리는 것이 이긴다 — 침식으로 굳었으면 무엇을
 * 했든 석화이고, 도시를 떨어뜨렸으면 그 뒤의 사정은 의미가 없다.
 *
 * ```
 * { erosion: 100 }                              -> petrification
 * { refined: 9, crystalsEverMade: 10, cleared }  -> ascension  (9/10 을 스스로 팔았다)
 * { crystalsEverMade: 0, cleared }               -> harmony    (아무도 태우지 않았다)
 * ```
 */
export function resolveEnding(s: RunSummary): EndingId {
  // 굳었으면 그것으로 끝이다. 무엇을 했든.
  if (s.erosion >= EROSION_MAX) return 'petrification';

  // 끝까지 못 갔으면 추락 — 도시가 아니라 당신이 떨어진 것이다.
  if (!s.cleared) return 'fall';

  // 판 연료가 도시를 키워 무너뜨렸다.
  if (s.cityPower >= CITY_COLLAPSE_AT) return 'fall';

  // 덱이 이미 숲이다.
  if (s.sylvanCards >= SYLVAN_DECK_AT) return 'sylvan_bond';

  // 붉은 천과 손잡고 기관차를 멈춰 세웠다.
  if (s.ally === 'ironguard') return 'revolution';

  // 결정의 절반 넘게 스스로 태워 팔았다 — 교리가 말하는 그대로.
  if (s.crystalsEverMade > 0 && s.refined / s.crystalsEverMade >= 0.5) return 'ascension';

  // 아무도 태우지 않고 끝냈다. 가장 어렵다.
  if (s.crystalsEverMade === 0) return 'harmony';

  // 태웠지만 팔지는 않았다 — 굳은 채로 걸어 나간다.
  return 'wayfarer';
}

/** 판정이 왜 그렇게 났는지 한 줄로 — 엔딩 화면이 근거를 보여 주기 위한 것. */
export function explainEnding(s: RunSummary, ending: EndingId): string {
  switch (ending) {
    case 'petrification':
      return `침식 ${s.erosion} — 연료가 되기 전에 굳었다.`;
    case 'fall':
      return s.cleared
        ? `부유도시 강화 ${s.cityPower} — 당신이 판 연료가 도시를 떨어뜨렸다.`
        : '회차를 끝내지 못했다.';
    case 'sylvan_bond':
      return `세계수 카드 ${s.sylvanCards}장 — 덱이 이미 숲이 되었다.`;
    case 'revolution':
      return '아이언가드와 손잡고 기관차를 멈춰 세웠다.';
    case 'ascension':
      return `결정 ${s.crystalsEverMade}장 중 ${s.refined}장을 스스로 태워 팔았다 — 교리대로.`;
    case 'harmony':
      return '결정을 하나도 만들지 않고 끝냈다.';
    default:
      return `결정 ${s.crystalsEverMade}장을 만들었으나 팔지 않았다 — 굳은 채로 걸어 나간다.`;
  }
}
