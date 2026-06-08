// 옛 quest CMS 패턴 — /scenes/[id]/revisions 별도 페이지.
// 정적 코드 검사 — RevisionHistorySection 재사용 + 페이지 헤더 + 씬 편집 복귀 링크.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("/scenes/[id]/revisions — 별도 리비전 페이지", () => {
  const code = fs.readFileSync(
    path.resolve("src/app/scenes/[id]/revisions/page.tsx"),
    "utf-8",
  );

  test("RevisionHistorySection 컴포넌트 import + 재사용", () => {
    // import 패턴 — 위치는 graph 디렉토리.
    expect(code).toMatch(/RevisionHistorySection/);
    expect(code).toMatch(/revisionHistorySection/);
  });

  test("sceneId prop 으로 id 전달", () => {
    // sceneId={id} 또는 sceneId={...} 패턴.
    expect(code).toMatch(/sceneId=\{[^}]+\}/);
  });

  test("페이지 제목 '리비전' 노출", () => {
    expect(code).toMatch(/리비전/);
  });

  test("'씬 편집' 으로 돌아가는 링크 존재 (/scenes/[id])", () => {
    // /scenes/${id} 또는 /scenes/${...} 패턴 (revisions 미포함).
    expect(code).toMatch(/\/scenes\/\$\{[^}]+\}(?![^`'"]*\/revisions)/);
  });
});
