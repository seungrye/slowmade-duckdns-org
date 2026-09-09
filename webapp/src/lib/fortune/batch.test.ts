import { describe, it, expect } from "vitest";
import { shouldRunBatch } from "./batch";

// ── 자정 직후로 당긴다 (#451) ──────────────────────────────────────
//
// 04시 게이트가 제보의 실제 원인이었다. 사용자는 자정 직후에 운세를 열어 보는데, 그때는
// 배치 전이라 lazy 생성이 넣어 둔 **템플릿 폴백**만 보인다. DB 기록이 그대로였다:
// 9/10 문서는 KST 01:36 에 만들어져 01:36 에 조회됐고 sajuSource 는 template,
// 9/9 문서는 00:09 에 조회됐는데 LLM 이 채워진 건 그날 23:51 이었다.
//
// 시(hour) 게이트로는 00:10 을 표현할 수 없어 **분 단위**로 바꾼다.

import { kstMinutes, shouldRunNow } from "./batch";

describe("shouldRunBatch — 순수 게이트 (#388)", () => {
  it("여는 시각 전이면 안 돌린다", () => {
    expect(shouldRunBatch(9, null, "2026-09-03", 10)).toBe(false);
    expect(shouldRunBatch(0, null, "2026-09-03", 10)).toBe(false);
  });

  it("지났고 오늘 안 돌렸으면 돌린다", () => {
    expect(shouldRunBatch(10, null, "2026-09-03", 10)).toBe(true);
    expect(shouldRunBatch(540, "2026-09-02", "2026-09-03", 10)).toBe(true);
  });

  it("오늘 이미 돌렸으면 안 돌린다(중복 방지)", () => {
    expect(shouldRunBatch(540, "2026-09-03", "2026-09-03", 10)).toBe(false);
  });

  it("재시작으로 lastRun 이 null 이면 다시 돌린다(멱등 catch-up)", () => {
    expect(shouldRunBatch(720, null, "2026-09-03", 10)).toBe(true);
  });
});

describe("kstMinutes — 자정으로부터 몇 분(KST)", () => {
  it("UTC 15:00 → KST 자정 0분", () => {
    expect(kstMinutes(new Date("2026-09-10T15:00:00Z"))).toBe(0);
  });

  it("UTC 15:10 → KST 00:10 → 10분", () => {
    expect(kstMinutes(new Date("2026-09-10T15:10:00Z"))).toBe(10);
  });

  it("UTC 14:59 → KST 23:59 → 1439분(전날 끝)", () => {
    expect(kstMinutes(new Date("2026-09-10T14:59:00Z"))).toBe(23 * 60 + 59);
  });

  it("UTC 00:00 → KST 09:00 → 540분", () => {
    expect(kstMinutes(new Date("2026-09-10T00:00:00Z"))).toBe(540);
  });
});

describe("shouldRunNow — 자정 직후 게이트 (#451)", () => {
  // `shouldRunBatch(9, …, 10)` 처럼 숫자만 넣으면 상수를 바꿔도 통과한다(못 잡는 시험).
  // 실제 시각을 넣어 **몇 시에 열리는지**를 잰다.
  const at = (utc: string, lastRun: string | null = null) => shouldRunNow(new Date(utc), lastRun);

  it("KST 00:09 에는 아직 안 돌린다", () => {
    expect(at("2026-09-10T15:09:00Z")).toBe(false);
  });

  it("KST 00:10 이 되면 돌린다 — 예전 04시 게이트라면 여기서 false 였다", () => {
    expect(at("2026-09-10T15:10:00Z")).toBe(true);
  });

  it("KST 01:36 — 제보자가 실제로 열어 본 시각에도 이미 돌아 있다", () => {
    // 9/10 문서가 만들어진 시각. 예전엔 04시 전이라 폴백만 보였다.
    expect(at("2026-09-09T16:36:00Z")).toBe(true);
  });

  it("늦게 켜져도 그날 몫을 돌린다 — 멱등 catch-up", () => {
    expect(at("2026-09-10T00:00:00Z")).toBe(true); // KST 09:00
  });

  it("오늘 이미 돌렸으면 안 돌린다", () => {
    expect(at("2026-09-10T00:00:00Z", "2026-09-10")).toBe(false);
  });

  it("날이 바뀌면 다시 돈다 — 어제 돌린 기록은 오늘을 막지 않는다", () => {
    expect(at("2026-09-10T15:10:00Z", "2026-09-09")).toBe(true);
  });
});

describe("타로와 사주는 순차다 (#451)", () => {
  // 왜 소스를 보나: 이 보장은 밖에서 안 보인다. 순서를 실제로 재려면 mongoose 모델과 LLM
  // shim 을 통째로 목으로 세워야 하는데, 그 장치가 지키려는 것보다 커진다. 로컬 shim 은
  // 한 장에 ~30초라 둘을 동시에 던지면 서로를 굶긴다 — 그래서 규칙을 여기에 못박는다.
  it("배치가 두 생성을 한꺼번에 던지지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./batch.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/Promise\.(all|allSettled|race)/);
  });
});
