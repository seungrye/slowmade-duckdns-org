// 오늘의 기운 — 일진의 **두 글자**를 다 쓴다 (#449).
//
// 폴백 풀이가 30일에 5가지뿐이었다(각 6일). `sajuContext` 가 일진의 천간 오행만 쓰고
// 지지(`zhiEl`)를 계산해 놓고 버렸기 때문이다. 천간 오행은 갑을=목, 병정=화 … 라 **2일
// 주기**여서 이틀 연속 문장이 완전히 같았다.
//
// 여기서 막는 것은 두 가지다:
//   1. 지지가 실제로 쓰이는가 — 같은 천간·다른 지지면 결과가 달라야 한다.
//   2. 한 달을 걸었을 때 문장이 충분히 갈리는가 — 숫자로 못박는다.

import { describe, it, expect } from "vitest";
import {
  computeSaju, todayIljin, sajuContext, templateSajuReading, buildSajuPrompt, todayOverlay,
} from "./saju";

/** 아무 사주 하나 — 여기서 보는 것은 특정 일간이 아니라 **날마다 갈리는가**다. */
const saju = computeSaju(new Date("1982-09-14T00:00:00+09:00"), "10:30");

const readingsOver = (days: number) => {
  const out = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(2026, 8, 10) + i * 86400000);
    out.add(templateSajuReading(sajuContext(saju, todayIljin(d).pillar)));
  }
  return out;
};

describe("sajuContext — 지지를 버리지 않는다", () => {
  it("일진의 지지 오행을 싣는다", () => {
    const ctx = sajuContext(saju, todayIljin(new Date(Date.UTC(2026, 8, 10))).pillar);
    expect(ctx.iljinZhiEl).toBeDefined();
  });

  it("천간이 같아도 지지가 다르면 다른 맥락이다 — 이틀 연속 같은 문장이 나오지 않게", () => {
    // 갑(목)·을(목)처럼 천간 오행이 같은 이틀을 찾아 비교한다.
    let found = 0;
    for (let i = 0; i < 60 && found < 3; i++) {
      const a = todayIljin(new Date(Date.UTC(2026, 8, 10) + i * 86400000)).pillar;
      const b = todayIljin(new Date(Date.UTC(2026, 8, 11) + i * 86400000)).pillar;
      if (a.ganEl !== b.ganEl) continue;
      found++;
      expect(templateSajuReading(sajuContext(saju, a)))
        .not.toBe(templateSajuReading(sajuContext(saju, b)));
    }
    expect(found).toBeGreaterThan(0); // 그런 이틀이 실제로 있다
  });
});

describe("templateSajuReading — 한 달을 걸어도 지루하지 않게", () => {
  it("30일에 최소 12가지 (예전엔 5가지였다)", () => {
    expect(readingsOver(30).size).toBeGreaterThanOrEqual(12);
  });

  it("연속한 이틀이 같은 문장이 아니다", () => {
    for (let i = 0; i < 30; i++) {
      const a = todayIljin(new Date(Date.UTC(2026, 8, 10) + i * 86400000)).pillar;
      const b = todayIljin(new Date(Date.UTC(2026, 8, 11) + i * 86400000)).pillar;
      expect(
        templateSajuReading(sajuContext(saju, a)),
        `${a.ganzhi} → ${b.ganzhi}`,
      ).not.toBe(templateSajuReading(sajuContext(saju, b)));
    }
  });

  it("여전히 존댓말이다", () => {
    for (const r of readingsOver(30)) expect(r).toMatch(/(요|다)\.$/);
  });
});

describe("buildSajuPrompt — LLM 에도 절반만 주지 않는다", () => {
  it("지지 기운이 프롬프트에 실린다", () => {
    const ctx = sajuContext(saju, todayIljin(new Date(Date.UTC(2026, 8, 10))).pillar);
    const user = buildSajuPrompt(ctx).map((m) => m.content).join("\n");
    expect(user).toContain(ctx.iljinZhiEl);
  });
});

describe("todayOverlay — 오행 저울에 오늘을 얹는다 (#449)", () => {
  const base = { 목: 0, 화: 1, 토: 3, 금: 1, 수: 1 } as const;

  it("일진의 두 기운에 각각 1을 더한다", () => {
    // 丁亥 — 천간 丁=화, 지지 亥=수.
    const o = todayOverlay(base, "화", "수");
    expect(o.화).toEqual({ base: 1, add: 1, total: 2 });
    expect(o.수).toEqual({ base: 1, add: 1, total: 2 });
  });

  it("나머지는 그대로다", () => {
    const o = todayOverlay(base, "화", "수");
    expect(o.목).toEqual({ base: 0, add: 0, total: 0 });
    expect(o.토).toEqual({ base: 3, add: 0, total: 3 });
    expect(o.금).toEqual({ base: 1, add: 0, total: 1 });
  });

  it("천간과 지지가 같은 오행이면 2가 더해진다 — 戊辰 같은 날", () => {
    const o = todayOverlay(base, "토", "토");
    expect(o.토).toEqual({ base: 3, add: 2, total: 5 });
  });

  it("막대 눈금은 오늘 얹은 것까지 담는다 — 넘치면 잘린다", () => {
    const o = todayOverlay(base, "토", "토");
    const max = Math.max(...Object.values(o).map((v) => v.total));
    expect(max).toBe(5);
  });
});
