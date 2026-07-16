// #271 콘텐츠 구조 lint — 순수 함수.
//
// 규칙:
//   ORPHAN              — 시작 씬도 아니고 어떤 분기의 target 도 아닌 씬.
//   DEAD_END            — choices 가 비었는데 isEnding=false (또는 endingId 없음).
//   TOO_MANY_CHOICES    — choices.length > 6 (저작 pool 상한). 화면엔 회차별 3개만
//                         랜덤 노출(choiceSample.pickDisplayedChoices) 하므로 pool 은 6까지 허용.
//   DANGLING_REF        — choice 의 to/onSuccess/onFailure 가 sceneRegistry 에 없는 id.
//   UNREACHABLE_ENDING  — requiredEndings 의 어떤 endingId 도 시작 씬에서 도달 불가
//                         (분기 hidden/조건 무시한 *그래프 도달성*. 자격은 e2e 가 별도 검증).
//
// 모든 ConditionalChoice 의 hidden=true 도 lint 그래프 도달성에는 *그대로 포함* —
// 실제 자격은 e2e 가 책임 ; lint 는 *그래프 구조* 책임.

import type { EndingId, Scene, SceneRegistry } from "@/types/web-adventure";

export type LintCode =
  | "ORPHAN"
  | "DEAD_END"
  | "TOO_MANY_CHOICES"
  | "DANGLING_REF"
  | "UNREACHABLE_ENDING";

export interface LintIssue {
  code: LintCode;
  sceneId?: string;
  endingId?: EndingId;
  detail?: string;
}

export interface LintOptions {
  /** 시작 씬 id 들 (보통 3 주인공의 startScene). orphan + 도달성 root. */
  startSceneIds: string[];
  /** 도달해야 하는 EndingId 목록. 빠뜨리면 UNREACHABLE_ENDING. */
  requiredEndings?: EndingId[];
  /** 저작 pool 최대 분기 수 (기본 6; 화면은 랜덤 3-of-N). */
  maxChoices?: number;
  /**
   * reducer 자동 전환으로 진입하는 ending 씬 id 들 (예: ending_petrification 은
   * stigma ≥ 100 자동). ORPHAN 검출 + UNREACHABLE_ENDING 검출에서 제외.
   */
  autoEndingSceneIds?: string[];
  /**
   * reducer 가 *씬 데이터 없이* 직접 ending 으로 전환하는 endingId 들 (#327 이후
   * ending_petrification 씬을 삭제했으므로 화이트리스트는 endingId 기반으로도
   * 필요). UNREACHABLE_ENDING 검출에서 제외.
   */
  autoEndingIds?: EndingId[];
}

export interface LintResult {
  issues: LintIssue[];
}

function collectChoiceTargets(scene: Scene): string[] {
  const targets: string[] = [];
  for (const c of scene.choices ?? []) {
    const choice = c as Record<string, unknown>;
    if (typeof choice.to === "string") targets.push(choice.to);
    if (typeof choice.onSuccess === "string") targets.push(choice.onSuccess as string);
    if (typeof choice.onFailure === "string") targets.push(choice.onFailure as string);
  }
  return targets;
}

function bfsReachableEndings(
  registry: SceneRegistry,
  startSceneIds: string[],
): Set<EndingId> {
  const visited = new Set<string>();
  const endings = new Set<EndingId>();
  const queue: string[] = [...startSceneIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const scene = registry[id];
    if (!scene) continue;
    if (scene.isEnding && scene.endingId) {
      endings.add(scene.endingId as EndingId);
      continue; // 엔딩 씬은 분기 follow 안 함.
    }
    for (const t of collectChoiceTargets(scene)) {
      if (!visited.has(t)) queue.push(t);
    }
  }
  return endings;
}

function bfsReachableSceneIds(
  registry: SceneRegistry,
  startSceneIds: string[],
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [...startSceneIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const scene = registry[id];
    if (!scene) continue;
    for (const t of collectChoiceTargets(scene)) {
      if (!visited.has(t)) queue.push(t);
    }
  }
  return visited;
}

export function lintSceneContent(
  registry: SceneRegistry,
  options: LintOptions,
): LintResult {
  const maxChoices = options.maxChoices ?? 6;
  const autoEndings = new Set(options.autoEndingSceneIds ?? []);
  const issues: LintIssue[] = [];

  // 1) Orphan — 시작이 아니고, 어떤 씬의 분기 target 도 아니고, *자동 전환* 도 아닌 id.
  const reachable = bfsReachableSceneIds(registry, options.startSceneIds);
  for (const id of Object.keys(registry)) {
    if (!reachable.has(id) && !autoEndings.has(id)) {
      issues.push({ code: "ORPHAN", sceneId: id });
    }
  }

  for (const id of Object.keys(registry)) {
    const scene = registry[id];
    // 2) Dead-end.
    if ((!scene.choices || scene.choices.length === 0) && !scene.isEnding) {
      issues.push({ code: "DEAD_END", sceneId: id });
    }
    // 3) Too many choices.
    if (scene.choices && scene.choices.length > maxChoices) {
      issues.push({
        code: "TOO_MANY_CHOICES",
        sceneId: id,
        detail: `${scene.choices.length} > ${maxChoices}`,
      });
    }
    // 4) Dangling ref.
    for (const t of collectChoiceTargets(scene)) {
      if (!registry[t]) {
        issues.push({ code: "DANGLING_REF", sceneId: id, detail: `→ ${t}` });
      }
    }
  }

  // 5) Unreachable endings — autoEndingSceneIds 의 endingId 는 자동 전환이므로
  //    그래프 도달성 검사에서 제외 (e2e 가 별도 검증).
  if (options.requiredEndings && options.requiredEndings.length > 0) {
    const reached = bfsReachableEndings(registry, options.startSceneIds);
    const autoEndingIds = new Set<EndingId>(options.autoEndingIds ?? []);
    for (const sceneId of autoEndings) {
      const s = registry[sceneId];
      if (s?.isEnding && s.endingId) autoEndingIds.add(s.endingId as EndingId);
    }
    for (const e of options.requiredEndings) {
      if (!reached.has(e) && !autoEndingIds.has(e)) {
        issues.push({ code: "UNREACHABLE_ENDING", endingId: e });
      }
    }
  }

  return { issues };
}
