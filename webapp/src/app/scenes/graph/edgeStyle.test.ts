// #278 — hidden conditional 분기 edge 의 opacity 약화 검증.

import { describe, it, expect } from "vitest";

import { edgeStyleForKind } from "./edgeStyle";

describe("edge 스타일 — hidden conditional 약화 (#278)", () => {
  it("hidden conditional 는 회색 + 점선 + opacity 0.55", () => {
    const r = edgeStyleForKind({ kind: "conditional", hidden: true, label: "x" });
    expect(r.stroke).toBe("#9ca3af");
    expect(r.strokeDasharray).toBe("4 3");
    expect(r.opacity).toBe(0.55);
  });

  it("미숨김 conditional 는 파랑 실선 (opacity 없음)", () => {
    const r = edgeStyleForKind({ kind: "conditional", hidden: false, label: "x" });
    expect(r.stroke).toBe("#2563eb");
    expect(r.strokeDasharray).toBeUndefined();
    expect(r.opacity).toBeUndefined();
  });

  it("plain 은 짙은 회색 실선", () => {
    const r = edgeStyleForKind({ kind: "plain", label: "x" });
    expect(r.stroke).toBe("#374151");
    expect(r.strokeDasharray).toBeUndefined();
  });

  it("probability success/failure 색 분리", () => {
    expect(edgeStyleForKind({ kind: "probability", branch: "success", label: "x" }).stroke).toBe("#16a34a");
    const fail = edgeStyleForKind({ kind: "probability", branch: "failure", label: "x" });
    expect(fail.stroke).toBe("#dc2626");
    expect(fail.strokeDasharray).toBe("6 4");
  });
});
