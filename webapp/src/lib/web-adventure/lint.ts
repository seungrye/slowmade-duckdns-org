// #271 content structure lint - pure functions.
//
// The rules:
//   ORPHAN              - a scene that is neither a starting scene nor any branch's target.
//   DEAD_END            - choices is empty while isEnding=false (or there is no endingId).
//   TOO_MANY_CHOICES    - choices.length > 6 (the authoring pool cap). Only 3 per run are shown on screen at
//                         random (choiceSample.pickDisplayedChoices), so a pool of up to 6 is allowed.
//   DANGLING_REF        - a choice's to/onSuccess/onFailure names an id absent from the sceneRegistry.
//   UNREACHABLE_ENDING  - an endingId in requiredEndings is unreachable from any starting scene
//                         (*graph reachability*, ignoring hidden branches and conditions. Eligibility is verified separately by the e2e tests).
//
// Every ConditionalChoice with hidden=true is *included as is* in the lint's graph reachability -
// actual eligibility is the e2e tests' responsibility; lint's is *the graph structure*.

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
  /** The starting scene ids (usually the 3 protagonists' startScene). The roots for orphan and reachability checks. */
  startSceneIds: string[];
  /** The EndingIds that must be reachable. A missing one is an UNREACHABLE_ENDING. */
  requiredEndings?: EndingId[];
  /** The authoring pool's maximum branches (6 by default; the screen shows a random 3 of N). */
  maxChoices?: number;
  /**
   * The ending scene ids entered through the reducer's automatic transition (ending_petrification, say, fires
   * automatically at stigma >= 100). Excluded from both the ORPHAN and UNREACHABLE_ENDING checks.
   */
  autoEndingSceneIds?: string[];
  /**
   * The endingIds the reducer moves to directly *without scene data* (since #327 deleted the ending_petrification
   * scene, the whitelist is also needed keyed by endingId). Excluded from the UNREACHABLE_ENDING check.
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
      continue; // An ending scene's branches are not followed.
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

  // 1) Orphan - an id that is not a start, not any scene's branch target, and not *an automatic transition*.
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

  // 5) Unreachable endings - an endingId in autoEndingSceneIds is an automatic transition and so is
  //    excluded from the graph reachability check (the e2e tests verify it separately).
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
