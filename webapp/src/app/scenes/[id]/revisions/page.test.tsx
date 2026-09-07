// The old quest CMS pattern - a separate /scenes/[id]/revisions page.
// A static code check - reusing RevisionHistorySection plus the page header and the link back to scene editing.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("/scenes/[id]/revisions — 별도 리비전 페이지", () => {
  const code = fs.readFileSync(
    path.resolve("src/app/scenes/[id]/revisions/page.tsx"),
    "utf-8",
  );

  test("RevisionHistorySection 컴포넌트 import + 재사용", () => {
    // The import pattern - it lives in the graph directory.
    expect(code).toMatch(/RevisionHistorySection/);
    expect(code).toMatch(/revisionHistorySection/);
  });

  test("sceneId prop 으로 id 전달", () => {
    // The sceneId={id} or sceneId={...} pattern.
    expect(code).toMatch(/sceneId=\{[^}]+\}/);
  });

  test("페이지 제목 '리비전' 노출", () => {
    expect(code).toMatch(/리비전/);
  });

  test("'씬 편집' 으로 돌아가는 링크 존재 (/scenes/[id])", () => {
    // The /scenes/${id} or /scenes/${...} pattern (without revisions).
    expect(code).toMatch(/\/scenes\/\$\{[^}]+\}(?![^`'"]*\/revisions)/);
  });
});
