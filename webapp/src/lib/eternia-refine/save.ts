// 회차 저장·이어하기 (#435).
//
// #430·#432 로 회차가 5노드에서 **3막 15노드+** 로 길어졌다. 그런데 저장이 없어서
// 브라우저를 닫으면 통째로 날아갔다 — 짧을 때는 괜찮던 것이 길어지면서 결함이 됐다.
//
// ── 무엇을 저장하지 않는가 ─────────────────────────────────────────
//
// `Session` 을 통째로 넣지 않는다.
//
// - **지도**: 씨앗과 막이 있으면 다시 만들면 같다(#430 의 재현성). 저장하면 두 벌이 되고,
//   어긋나면 어느 쪽이 옳은지 알 수 없다.
// - **씬**: 콘텐츠이지 상태가 아니다. 매번 받아 오면 되고, 저장하면 몇 MB 를 브라우저에
//   쌓게 된다.
//
// 그래서 저장본은 `run`·`phase`·`crystalsEverMade` 뿐이고, 복원은 나머지를 **다시 만든다**.
//
// ── 전투 중에는 저장하지 않는다 ─────────────────────────────────────
//
// 전투는 `CombatState` 로 회차 상태 밖에 있다. 중간 저장을 허용하면 불리한 턴에서 되감는
// 길이 열린다. **노드 사이에서만** 저장한다 — 지도·이야기·정제소·동맹·보상 화면.

import type { Phase, Session } from './run';
import { mapFor } from './run';
import type { RunState } from './types';
import type { ScenarioScene } from './scenario';

export const SAVE_KEY = 'eternia-refine:save:v1';

/** 저장본. 다시 만들 수 있는 것은 안 담는다. */
export interface SavedRun {
  v: 1;
  run: RunState;
  phase: Phase;
  crystalsEverMade: number;
}

/** 이 화면에서 저장해도 되나 — 전투 중이거나 끝난 회차는 저장하지 않는다. */
export function isSavable(phase: Phase): boolean {
  return (
    phase.kind === 'map' ||
    phase.kind === 'story' ||
    phase.kind === 'refinery' ||
    phase.kind === 'alliance' ||
    phase.kind === 'reward'
  );
}

/** 저장본으로 줄인다. 저장하면 안 되는 화면이면 null. */
export function toSave(session: Session): SavedRun | null {
  if (!isSavable(session.phase)) return null;
  return {
    v: 1,
    run: session.run,
    phase: session.phase,
    crystalsEverMade: session.crystalsEverMade,
  };
}

/**
 * 저장본을 회차로 되살린다. 지도는 씨앗에서 **다시 만든다**.
 *
 * 씬을 그때는 못 받았고 지금은 받았다면(또는 그 반대라면) 지도가 달라질 수 있다 —
 * 그래서 노드 id 가 지금 지도에 없으면 **막의 처음으로 돌려보낸다.** 회차를 잃는 것보다
 * 한 층 되돌리는 편이 낫다.
 */
export function fromSave(saved: SavedRun, scenes: readonly ScenarioScene[] | null): Session {
  const map = mapFor(saved.run.act, saved.run.seed, scenes);
  const known = saved.run.nodeId !== null && map.nodes.some((n) => n.id === saved.run.nodeId);
  const run: RunState = known ? saved.run : { ...saved.run, nodeId: map.nodes[0]?.id ?? null };
  const phase: Phase = known ? saved.phase : { kind: 'map' };
  return { run, phase, crystalsEverMade: saved.crystalsEverMade, map, scenes };
}

/** 모양이 맞는 저장본인가 — 손으로 고친 것·옛 판을 걸러 낸다. */
export function isValidSave(x: unknown): x is SavedRun {
  if (x === null || typeof x !== 'object') return false;
  const s = x as Partial<SavedRun>;
  if (s.v !== 1) return false;
  if (typeof s.crystalsEverMade !== 'number') return false;
  if (!s.phase || typeof s.phase.kind !== 'string') return false;
  const r = s.run;
  return (
    !!r &&
    typeof r.erosion === 'number' &&
    typeof r.hp === 'number' &&
    typeof r.seed === 'number' &&
    typeof r.act === 'number' &&
    Array.isArray(r.deck)
  );
}

// ── 브라우저 쪽 (부수효과) ──────────────────────────────────────────
//
// 위는 전부 순수하다. 아래만 localStorage 를 만지고, **실패는 전부 삼킨다** —
// 저장 때문에 회차가 멈추면 안 된다.

export function writeSave(session: Session): void {
  if (typeof window === 'undefined') return;
  const saved = toSave(session);
  try {
    if (saved === null) return;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch {
    /* 저장 실패가 회차를 막지 않는다 */
  }
}

export function readSave(): SavedRun | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 회차가 끝나면 지운다 — 끝난 판을 다시 열 이유가 없다. */
export function clearSave(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 지우기 실패도 조용히 */
  }
}
