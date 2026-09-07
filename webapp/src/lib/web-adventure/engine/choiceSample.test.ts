import { describe, it, expect } from "vitest";
import { pickDisplayedChoices } from "./choiceSample";
import type { Character, Choice } from "@/types/web-adventure";

// A minimal character - only the fields the conditional evaluation needs. The rest is omitted through a cast.
function char(overrides: Partial<Character> = {}): Character {
  return {
    stats: { str: 10, dex: 10, int: 10, cha: 10, con: 10, wis: 10 },
    inventory: [],
    flags: {},
    ...overrides,
  } as Character;
}

const plain = (id: string): Choice => ({ kind: "plain", id, label: id, to: "e" });

describe("pickDisplayedChoices", () => {
  it("visible ≤ 3 이면 그대로 전부 반환(추첨 없음)", () => {
    const cs = [plain("a"), plain("b"), plain("c")];
    const out = pickDisplayedChoices(cs, char(), { seed: "1:s" });
    expect(out.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("visible > 3 이면 정확히 3개만 반환", () => {
    const cs = [plain("a"), plain("b"), plain("c"), plain("d"), plain("e")];
    const out = pickDisplayedChoices(cs, char(), { seed: "1:s" });
    expect(out).toHaveLength(3);
  });

  it("같은 seed 는 항상 같은 조합(안정 — 리롤 악용 방지)", () => {
    const cs = [plain("a"), plain("b"), plain("c"), plain("d"), plain("e"), plain("f")];
    const a = pickDisplayedChoices(cs, char(), { seed: "1:s" }).map((c) => c.id);
    const b = pickDisplayedChoices(cs, char(), { seed: "1:s" }).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("seed(회차)가 바뀌면 조합이 달라질 수 있다(반복 플레이)", () => {
    const cs = [plain("a"), plain("b"), plain("c"), plain("d"), plain("e"), plain("f")];
    const seeds = ["1:s", "2:s", "3:s", "4:s", "5:s"].map((seed) =>
      pickDisplayedChoices(cs, char(), { seed }).map((c) => c.id).join(","),
    );
    // At least two different combinations come out.
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it("결과는 원저작 순서를 유지", () => {
    const cs = [plain("a"), plain("b"), plain("c"), plain("d"), plain("e")];
    const out = pickDisplayedChoices(cs, char(), { seed: "7:s" }).map((c) => c.id);
    const order = ["a", "b", "c", "d", "e"];
    const sorted = [...out].sort((x, y) => order.indexOf(x) - order.indexOf(y));
    expect(out).toEqual(sorted);
  });

  it("pinned plain 은 항상 노출(추첨 제외)", () => {
    const cs: Choice[] = [
      { ...plain("keepme"), pinned: true },
      plain("a"), plain("b"), plain("c"), plain("d"), plain("e"),
    ];
    // always included, whichever seed is tried
    for (const seed of ["1:s", "2:s", "9:s", "42:s"]) {
      const out = pickDisplayedChoices(cs, char(), { seed }).map((c) => c.id);
      expect(out).toContain("keepme");
      expect(out).toHaveLength(3);
    }
  });

  it("보이는 conditional 은 pinned 없이도 항상 노출(추첨 대상 아님)", () => {
    const cond: Choice = {
      kind: "conditional", id: "cond", label: "cond", to: "e",
      condition: { kind: "minStat", stat: "wis", min: 8 }, // wis 10 → 충족
    };
    const cs: Choice[] = [cond, plain("a"), plain("b"), plain("c"), plain("d")];
    for (const seed of ["1:s", "2:s", "5:s"]) {
      const out = pickDisplayedChoices(cs, char(), { seed }).map((c) => c.id);
      expect(out).toContain("cond");
      expect(out).toHaveLength(3);
    }
  });
});
