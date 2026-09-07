import { describe, it, expect } from "vitest";
import { flagsForStore } from "./flags";
import WebAdventurePastRun from "@/models/web-adventure-past-run";
import WebAdventureSave from "@/models/web-adventure-save";

/**
 * The dots in world.* flags made saving a run fail outright (#356).
 *
 * #256 injects the previous run's ending into the next run's `character.flags`, and those keys contain dots
 * (`world.harmony_kept`). Two models declared flags as a `Map of Boolean`, and
 * **MongoDB cannot use dots in Map keys** - the cast failed and the whole document was never saved.
 *
 * In other words it broke **unconditionally from the second run onward**. The first run has no world flags and passes, so it never showed.
 */
const 캐릭터 = (flags: Record<string, unknown>) => ({
  stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
  hp: 10, maxHp: 10, ability: "none", protagonist: "kael",
  stigmaErosion: 0, inventory: [], rerollsLeft: 0,
  flags: flagsForStore(flags),
});

describe("flagsForStore — 점이 든 키를 견딘다 (#356)", () => {
  it("점이 든 키를 그대로 둔다", () => {
    // Changing the keys would break every scene condition and every existing save. Leaving them alone is the point.
    expect(flagsForStore({ "world.harmony_kept": true })).toEqual({ "world.harmony_kept": true });
  });

  it("값을 boolean 으로 정리한다 — 예전 Map 이 해 주던 일", () => {
    expect(flagsForStore({ a: 1, b: 0, c: "yes", d: null })).toEqual({ a: true, b: false, c: true, d: false });
  });

  it("객체가 아니면 빈 것으로 본다", () => {
    expect(flagsForStore(undefined)).toEqual({});
    expect(flagsForStore("nope")).toEqual({});
    expect(flagsForStore([1, 2])).toEqual({});
  });
});

describe("모델이 점이 든 플래그를 받는다 (#356)", () => {
  const 점든플래그 = { "world.harmony_kept": true, reportedToSupervisor: true };

  it("past-run — 이게 안 되면 피드백 노트·갤러리·업적이 통째로 날아간다", () => {
    const doc = new WebAdventurePastRun({
      userEmail: "web@eternia", runIndex: 1, endingId: "purge",
      finalSceneId: "ending_purge", character: 캐릭터(점든플래그), completedAt: new Date(),
    });
    expect(doc.validateSync()?.errors?.["character.flags"]).toBeUndefined();
  });

  it("save — 이게 안 되면 로그인 사용자의 자동저장이 깨진다", () => {
    const doc = new WebAdventureSave({
      userEmail: "me@test.com", runIndex: 2,
      character: 캐릭터(점든플래그), currentSceneId: "scene_1",
    });
    expect(doc.validateSync()?.errors?.["character.flags"]).toBeUndefined();
  });

  it("점이 든 값이 그대로 읽힌다 — 게임 로직은 character.flags[key] 로 읽는다", () => {
    const doc = new WebAdventurePastRun({
      userEmail: "web@eternia", runIndex: 1, endingId: "purge",
      finalSceneId: "ending_purge", character: 캐릭터(점든플래그), completedAt: new Date(),
    });
    expect((doc.character.flags as Record<string, boolean>)["world.harmony_kept"]).toBe(true);
  });
});
