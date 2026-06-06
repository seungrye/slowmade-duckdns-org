// #275 EndingScreen 의 후일담 분리 표시.
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import EndingScreen from "./EndingScreen";
import type { Character } from "@/types/web-adventure";

const sampleChar: Character = {
  stats: { str: 5, dex: 5, int: 7, cha: 5, con: 5, wis: 5 },
  hp: 20,
  maxHp: 20,
  ability: "lunar",
  protagonist: "kael",
  stigmaErosion: 50,
  inventory: [],
  flags: {},
  rerollsLeft: 0,
};

describe("EndingScreen 후일담 (#275)", () => {
  it("aftermath 가 epilogue 와 분리 표시 (data-testid=ending-aftermath)", () => {
    render(
      <EndingScreen
        endingId="harmony"
        character={sampleChar}
        log={["선택: 시작", "선택: 끝"]}
        onRestart={() => {}}
      />,
    );
    const after = screen.queryByTestId("ending-aftermath");
    expect(after).toBeTruthy();
    // 후일담은 *—* 으로 시작.
    expect(after?.textContent?.startsWith("—")).toBe(true);
  });

  it("6 EndingId 모두 aftermath 가 endingsMeta 에 정의되어 있다", async () => {
    const { endingsMeta } = await import("@/content/web-adventure/endings");
    for (const id of ["ascension", "revolution", "harmony", "fall", "petrification", "sylvan_bond"] as const) {
      const meta = endingsMeta[id] as { aftermath?: string };
      expect(meta.aftermath, `${id} aftermath 누락`).toBeTruthy();
      expect(meta.aftermath!.length).toBeGreaterThan(10);
    }
  });

  // #294 — 최종 침식 표시 (시한부 톤).
  it("최종 침식 표시 — 침식 80 미만 일반 톤", () => {
    render(
      <EndingScreen
        endingId="revolution"
        character={{ ...sampleChar, stigmaErosion: 30 }}
        log={[]}
        onRestart={() => {}}
      />,
    );
    const el = screen.getByTestId("ending-final-stigma");
    expect(el).toHaveTextContent("30 / 100");
    expect(el.className).not.toMatch(/bg-indigo/);
  });

  it("최종 침식 100 → indigo 강조 + 자동 petrification 인디케이션", () => {
    render(
      <EndingScreen
        endingId="petrification"
        character={{ ...sampleChar, stigmaErosion: 100 }}
        log={[]}
        onRestart={() => {}}
      />,
    );
    const el = screen.getByTestId("ending-final-stigma");
    expect(el).toHaveTextContent("100 / 100");
    expect(el.className).toMatch(/bg-indigo-100/);
  });
});
