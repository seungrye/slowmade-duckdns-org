// #341 — /scenes/[id] 에 '차트에서 보기' 버튼 (graph?focus=<id>).
// 정적 코드 검사 — 마운트 의존성 없이 패턴만 검증.

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

// 옛 quest CMS 패턴 — '리비전 보기' 링크 (/scenes/[id]/revisions 로 이동).
describe("/scenes/[id] — 리비전 보기 링크", () => {
  const code = fs.readFileSync(
    path.resolve("src/app/scenes/[id]/page.tsx"),
    "utf-8",
  );

  test("'리비전 보기' 라벨 존재", () => {
    expect(code).toMatch(/리비전 보기/);
  });

  test("/scenes/[id]/revisions 경로 링크 존재", () => {
    // /scenes/${...}/revisions 패턴.
    expect(code).toMatch(/\/scenes\/\$\{[^}]+\}\/revisions/);
  });
});
