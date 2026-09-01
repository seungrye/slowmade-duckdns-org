import { describe, it, expect } from "vitest";
import { flagsForStore } from "./flags";
import WebAdventurePastRun from "@/models/web-adventure-past-run";
import WebAdventureSave from "@/models/web-adventure-save";

/**
 * world.* 플래그의 점 때문에 회차 저장이 통째로 실패했다 (#356).
 *
 * #256 이 이전 회차의 엔딩을 다음 회차 `character.flags` 에 주입하는데 그 키가 점을 포함한다
 * (`world.harmony_kept`). 두 모델이 flags 를 `Map of Boolean` 으로 선언해 뒀고,
 * **MongoDB 는 Map 키에 점을 못 쓴다** — 캐스팅이 실패하면서 문서 전체가 저장되지 않았다.
 *
 * 즉 **두 번째 회차부터 무조건** 터졌다. 첫 회차는 world flag 가 없어 통과하므로 안 드러났다.
 */
const 캐릭터 = (flags: Record<string, unknown>) => ({
  stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
  hp: 10, maxHp: 10, ability: "none", protagonist: "kael",
  stigmaErosion: 0, inventory: [], rerollsLeft: 0,
  flags: flagsForStore(flags),
});

describe("flagsForStore — 점이 든 키를 견딘다 (#356)", () => {
  it("점이 든 키를 그대로 둔다", () => {
    // 키를 바꾸면 씬 조건과 기존 저장이 전부 어긋난다. 그대로 두는 것이 핵심이다.
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
