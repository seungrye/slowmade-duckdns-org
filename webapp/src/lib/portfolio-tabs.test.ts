import { describe, expect, it } from "vitest";
import { buildTabs } from "./portfolio-tabs";

// #515 — 차트 탭이 **살아있는 포트폴리오** 에서만 만들어져(listEnvCurrencies), 블록을 다른
// 계좌로 옮기면 옛 계좌 탭이 통째로 사라진다. 기록은 DB 에 그대로 있는데 볼 방법이 없어진다.
//
// 실측(2026-09-30): paper-50194613 에 stocktrades 300건 · portfoliohistories 275건.
// 블록 3개를 새 계좌로 옮기면 이 탭이 사라진다.
//
// 그래서 탭은 **둘의 합집합**이어야 한다 — 살아있는 블록(매매 전이어도 보이는 현재 동작)
// ∪ 기록이 있는 조합(보관). 여기서 그 합치는 규칙만 본다.

const live = (env: string, currency: "KRW" | "USD") => ({ env, currency });

describe("buildTabs — 살아있는 블록 ∪ 기록이 있는 조합", () => {
  it("살아있는 블록은 매매 기록이 없어도 탭이 된다 — 만들자마자 보여야 한다", () => {
    const tabs = buildTabs([live("paper-50215100", "USD")], []);
    expect(tabs).toEqual([{ env: "paper-50215100", currency: "USD", archived: false }]);
  });

  it("블록이 떠난 계좌도 기록이 있으면 보관 탭으로 남는다 — 이게 이 변경의 핵심", () => {
    const tabs = buildTabs(
      [live("paper-50215100", "USD")],
      [live("paper-50194613", "USD"), live("paper-50215100", "USD")],
    );
    expect(tabs).toHaveLength(2);
    expect(tabs.find((t) => t.env === "paper-50194613")?.archived).toBe(true);
    expect(tabs.find((t) => t.env === "paper-50215100")?.archived).toBe(false);
  });

  it("같은 조합이 양쪽에 있어도 하나만 — 살아있는 쪽이 이긴다", () => {
    const tabs = buildTabs([live("paper-1", "KRW")], [live("paper-1", "KRW")]);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].archived).toBe(false);
  });

  it("통화가 다르면 다른 탭이다 — 국장·미장을 한 탭에 섞지 않는다", () => {
    const tabs = buildTabs([live("paper-1", "KRW"), live("paper-1", "USD")], []);
    expect(tabs).toHaveLength(2);
  });

  it("살아있는 탭이 보관 탭보다 앞에 온다 — 지금 돌고 있는 것을 먼저 본다", () => {
    const tabs = buildTabs(
      [live("paper-50215100", "USD")],
      [live("paper-00000001", "USD")], // env 이름으로는 이쪽이 앞이지만
    );
    expect(tabs[0].env).toBe("paper-50215100");
    expect(tabs[1].env).toBe("paper-00000001");
  });

  it("같은 그룹 안에서는 env·통화 순으로 안정 정렬 — 탭 순서가 새로고침마다 바뀌면 안 된다", () => {
    const tabs = buildTabs(
      [live("paper-b", "USD"), live("paper-a", "USD"), live("paper-a", "KRW")],
      [],
    );
    expect(tabs.map((t) => `${t.env}|${t.currency}`))
      .toEqual(["paper-a|KRW", "paper-a|USD", "paper-b|USD"]);
  });

  it("둘 다 비면 빈 배열 — 호출측이 폴백을 정한다", () => {
    expect(buildTabs([], [])).toEqual([]);
  });

  it("블록이 하나도 없어도 기록만 있으면 전부 보관 탭으로 보인다", () => {
    const tabs = buildTabs([], [live("paper-50194613", "USD"), live("paper-50194613", "KRW")]);
    expect(tabs).toHaveLength(2);
    expect(tabs.every((t) => t.archived)).toBe(true);
  });

  it("입력을 건드리지 않는다", () => {
    const a = [live("paper-1", "KRW")];
    const b = [live("paper-2", "USD")];
    const snapshot = JSON.stringify([a, b]);
    buildTabs(a, b);
    expect(JSON.stringify([a, b])).toBe(snapshot);
  });
});
