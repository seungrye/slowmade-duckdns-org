// #341 - a 'view in the chart' button on /scenes/[id] (graph?focus=<id>).
// A static code check - verifying the pattern alone, with no mount dependency.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("/scenes/[id] — #341 '차트에서 보기' 버튼", () => {
  const code = fs.readFileSync(
    path.resolve("src/app/scenes/[id]/page.tsx"),
    "utf-8",
  );

  test("페이지 코드에 /scenes/graph?focus= 링크 패턴 존재", () => {
    expect(code).toMatch(/\/scenes\/graph\?focus=/);
  });

  test("'차트' 또는 '그래프' 라벨이 버튼 텍스트로 존재", () => {
    expect(code).toMatch(/차트|그래프/);
  });

  test("encodeURIComponent 로 id 안전 인코딩", () => {
    expect(code).toMatch(/encodeURIComponent\([^)]*(?:scene\.id|id)[^)]*\)/);
  });
});

// The old quest CMS pattern - a 'view revisions' link (going to /scenes/[id]/revisions).
describe("/scenes/[id] — 리비전 보기 링크", () => {
  const code = fs.readFileSync(
    path.resolve("src/app/scenes/[id]/page.tsx"),
    "utf-8",
  );

  test("'리비전 보기' 라벨 존재", () => {
    expect(code).toMatch(/리비전 보기/);
  });

  test("/scenes/[id]/revisions 경로 링크 존재", () => {
    // The /scenes/${...}/revisions pattern.
    expect(code).toMatch(/\/scenes\/\$\{[^}]+\}\/revisions/);
  });
});
