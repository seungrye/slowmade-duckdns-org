import { describe, expect, it } from "vitest";
import { appendLiveLog, liveChangeEntry } from "./live-audit";

// #493 — 실주문 스위치를 누가 언제 켰는지 남기려는 것. 판정은 순수하게 여기서 한다.
const AT = new Date("2026-09-23T06:00:00Z");

describe("live-audit.liveChangeEntry — 바뀔 때만 남긴다", () => {
  it("false → true 면 항목을 만든다", () => {
    expect(liveChangeEntry(false, true, "me@x.com", AT))
      .toEqual({ at: AT, by: "me@x.com", enabled: true });
  });
  it("true → false 도 남긴다(끈 것도 이력이다)", () => {
    expect(liveChangeEntry(true, false, "me@x.com", AT)?.enabled).toBe(false);
  });
  it("같은 값을 다시 보내면 안 남긴다(재전송으로 로그가 불어나지 않게)", () => {
    expect(liveChangeEntry(true, true, "me@x.com", AT)).toBeNull();
    expect(liveChangeEntry(false, false, "me@x.com", AT)).toBeNull();
  });
  it("liveEnabled 가 없는 요청(메모·자격증명만 수정)은 안 남긴다", () => {
    expect(liveChangeEntry(false, undefined, "me@x.com", AT)).toBeNull();
    expect(liveChangeEntry(false, "true", "me@x.com", AT)).toBeNull(); // 문자열은 불리언이 아니다
  });
  it("이전 값이 없던 옛 문서는 false 로 본다", () => {
    expect(liveChangeEntry(undefined, true, "me@x.com", AT)?.enabled).toBe(true);
    expect(liveChangeEntry(null, false, "me@x.com", AT)).toBeNull();
  });
});

describe("live-audit.appendLiveLog — 상한 있는 누적", () => {
  const e = (n: number) => ({ at: new Date(AT.getTime() + n), by: "me@x.com", enabled: n % 2 === 0 });

  it("뒤에 붙인다", () => {
    expect(appendLiveLog([e(1)], e(2)).map((x) => x.at.getTime()))
      .toEqual([AT.getTime() + 1, AT.getTime() + 2]);
  });
  it("상한을 넘기면 오래된 것부터 떨어진다", () => {
    const log = Array.from({ length: 50 }, (_, i) => e(i));
    const out = appendLiveLog(log, e(99), 50);
    expect(out).toHaveLength(50);
    expect(out[0].at.getTime()).toBe(AT.getTime() + 1); // e(0) 이 밀려났다
    expect(out.at(-1)!.at.getTime()).toBe(AT.getTime() + 99);
  });
  it("원본 불변(순수)", () => {
    const log = [e(1)];
    appendLiveLog(log, e(2));
    expect(log).toHaveLength(1);
  });
  it("빈 로그·없는 로그도 받는다", () => {
    expect(appendLiveLog([], e(1))).toHaveLength(1);
    expect(appendLiveLog(undefined as never, e(1))).toHaveLength(1);
  });
});
