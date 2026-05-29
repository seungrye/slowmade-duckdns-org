import { describe, it, expect } from "vitest";
import {
  collectNamedZones,
  collectOpenPortals,
  collectFromQuest,
} from "./zone-extract";
import type { QuestDef } from "@/types/quest";

function quest(partial: Partial<QuestDef> = {}): QuestDef {
  return {
    id: "q",
    title: "q",
    giverNpc: "",
    initialPhase: "dormant",
    phases: { dormant: { dialog: [], objective: null } },
    transitions: [],
    spawns: [],
    ...partial,
  };
}

describe("collectOpenPortals (기존)", () => {
  it("OpenPortal 만 골라낸다", () => {
    expect(
      collectOpenPortals([
        { type: "OpenPortal", zone: "z1", generator: "bsp" },
        { type: "Log", text: "x" },
        { type: "OpenPortal", zone: "z2", generator: "forest" },
      ]),
    ).toEqual([
      { zone: "z1", generator: "bsp" },
      { zone: "z2", generator: "forest" },
    ]);
  });
});

describe("collectFromQuest (기존)", () => {
  it("transition 의 OpenPortal 누적", () => {
    const q = quest({
      transitions: [
        {
          from: "dormant",
          trigger: "Interact",
          to: "x",
          actions: [{ type: "OpenPortal", zone: "z", generator: "bsp" }],
        },
      ],
    });
    expect(collectFromQuest(q)).toEqual([{ zone: "z", generator: "bsp" }]);
  });
});

describe("collectNamedZones", () => {
  it("transition.actions 의 SpawnGuards/PlaceTraps/SpawnMonster Named zone", () => {
    const q = quest({
      transitions: [
        {
          from: "dormant",
          trigger: "Interact",
          to: "x",
          actions: [
            { type: "SpawnGuards", count: 4, zone: { type: "Named", id: "infiltration" } },
            { type: "PlaceTraps", kind: "Spike", count: 2, hidden: true, zone: { type: "Named", id: "trap_mine" } },
            { type: "SpawnMonster", monsterId: "wraith", count: 1, zone: { type: "Named", id: "wyrm_lair" } },
          ],
        },
      ],
    });
    expect(collectNamedZones(q).sort()).toEqual(["infiltration", "trap_mine", "wyrm_lair"]);
  });

  it("Town zone 은 카탈로그 등록 대상에서 제외 (표준 Named id 는 등록 대상)", () => {
    // Town 은 시작 마을(코드 정적) → 카탈로그 X. forest/dungeon_<N> 등 표준
    // Named id 는 카탈로그 자동 등록 대상이므로 결과 set 에 포함된다.
    const q = quest({
      transitions: [
        {
          from: "dormant",
          trigger: "Interact",
          to: "x",
          actions: [
            { type: "SpawnGuards", count: 4, zone: { type: "Town" } },
            { type: "PlaceTraps", kind: "Spike", count: 1, hidden: false, zone: { type: "Named", id: "forest" } },
            { type: "SpawnMonster", monsterId: "x", count: 1, zone: { type: "Named", id: "dungeon_3" } },
          ],
        },
      ],
    });
    expect(collectNamedZones(q).sort()).toEqual(["dungeon_3", "forest"]);
  });

  it("zone 미지정(Action 의 optional 필드) 시 무시", () => {
    const q = quest({
      transitions: [
        {
          from: "dormant",
          trigger: "Interact",
          to: "x",
          actions: [
            { type: "SpawnGuards", count: 4 },
            { type: "PlaceTraps", kind: "Alarm", count: 1, hidden: false },
            { type: "SpawnMonster", monsterId: "x", count: 1 },
          ],
        },
      ],
    });
    expect(collectNamedZones(q)).toEqual([]);
  });

  it("OpenPortal / ClosePortal 의 zone 도 포함", () => {
    const q = quest({
      transitions: [
        {
          from: "dormant",
          trigger: "Interact",
          to: "x",
          actions: [
            { type: "OpenPortal", zone: "demon_cave", generator: "bsp" },
            { type: "ClosePortal", zone: "buried_dungeon" },
          ],
        },
      ],
    });
    expect(collectNamedZones(q).sort()).toEqual(["buried_dungeon", "demon_cave"]);
  });

  it("InZone(Named) 조건 / And·Or·Not 재귀", () => {
    const q = quest({
      transitions: [
        {
          from: "dormant",
          trigger: "Auto",
          to: "x",
          when: {
            type: "And",
            conditions: [
              { type: "InZone", zone: { type: "Named", id: "skill_trial" } },
              {
                type: "Or",
                conditions: [
                  { type: "Not", condition: { type: "InZone", zone: { type: "Named", id: "hunting_ground" } } },
                ],
              },
            ],
          },
          actions: [],
        },
      ],
    });
    expect(collectNamedZones(q).sort()).toEqual(["hunting_ground", "skill_trial"]);
  });

  it("spawns 의 Named zone 과 condition 도 누적", () => {
    const q = quest({
      spawns: [
        { phase: "dormant", item: "potion", zone: { type: "Named", id: "herb_glade" } },
        {
          phase: "dormant",
          item: "gem",
          zone: { type: "Named", id: "forest" },
          condition: { type: "InZone", zone: { type: "Named", id: "dreadfort_vault" } },
        },
      ],
    });
    expect(collectNamedZones(q).sort()).toEqual(["dreadfort_vault", "forest", "herb_glade"]);
  });

  it("같은 zone 이 여러 번 나와도 dedup", () => {
    const q = quest({
      transitions: [
        {
          from: "dormant",
          trigger: "Interact",
          to: "x",
          actions: [
            { type: "SpawnGuards", count: 1, zone: { type: "Named", id: "x" } },
            { type: "SpawnGuards", count: 2, zone: { type: "Named", id: "x" } },
          ],
        },
      ],
      spawns: [{ phase: "dormant", item: "i", zone: { type: "Named", id: "x" } }],
    });
    expect(collectNamedZones(q)).toEqual(["x"]);
  });
});
