// 본문 문단의 시간축 — <<set>> 누적과 <<wait>> 지연을 문단 단위 순수 함수로 (#371).
//
// 렌더러가 아니라 여기서 전부 계산한다. 씬을 받은 순간 본문에 다 적혀 있으므로
// 상태가 필요 없다.

import { describe, it, expect } from "vitest";
import { parseScript, revealSchedule, varsByParagraph } from "./script";

/**
 * varsByParagraph(body, base?) — 문단 i 가 보간에 쓸 변수 묶음을 문단마다 하나씩.
 * 문단 i = base + 문단 0..i 의 <<set>>. set 이 든 문단 자신부터 새 값.
 */
describe("varsByParagraph — 문단별 <<set>> 누적", () => {
  it("<<set 키 값>> 을 담는다", () => {
    expect(varsByParagraph(["<<set 이름 카엘>>"])).toEqual([{ 이름: "카엘" }]);
  });

  it("남은 인자를 공백 하나로 잇는다", () => {
    expect(varsByParagraph(["<<set 이름 카엘 하이든>>"])).toEqual([{ 이름: "카엘 하이든" }]);
  });

  it("값 없는 <<set 키>> 는 키를 만들지 않는다", () => {
    expect(varsByParagraph(["<<set 이름>>"])).toEqual([{}]);
  });

  it("<<set>> 만 있으면 무시", () => {
    expect(varsByParagraph(["<<set>>"])).toEqual([{}]);
  });

  it("한 문단에서 같은 키를 두 번 적으면 뒤엣것이 이긴다", () => {
    expect(varsByParagraph(["<<set 이름 카엘>><<set 이름 리안>>"])).toEqual([{ 이름: "리안" }]);
  });

  it("문단을 건너 같은 키를 다시 적어도 뒤엣것이 이긴다", () => {
    expect(varsByParagraph(["<<set 이름 카엘>>", "<<set 이름 리안>>", "끝"])).toEqual([
      { 이름: "카엘" },
      { 이름: "리안" },
      { 이름: "리안" },
    ]);
  });

  it("<<setup …>> 은 set 이 아니다 — 무시", () => {
    expect(varsByParagraph(["<<setup 이름 카엘>>"])).toEqual([{}]);
  });

  it("<<set>> 은 그 문단 자신부터 적용된다 — 문단 끝에 적혀 있어도", () => {
    expect(varsByParagraph(["앞", "뒤<<set 이름 카엘>>", "그 다음"])).toEqual([
      {},
      { 이름: "카엘" },
      { 이름: "카엘" },
    ]);
  });

  it("값은 늘 문자열이다 — \"007\" 이 7 이 되지 않는다", () => {
    const out = varsByParagraph(["<<set 번호 007>>"]);
    expect(out).toEqual([{ 번호: "007" }]);
    expect(typeof out[0].번호).toBe("string");
  });

  it("base 를 밑에 깔고 문단별로 얹는다", () => {
    expect(varsByParagraph(["{{이름}}", "<<set 이름 카엘>>"], { 이름: "무명", 성: "하이든" })).toEqual([
      { 이름: "무명", 성: "하이든" },
      { 이름: "카엘", 성: "하이든" },
    ]);
  });

  it("base 없이도 동작한다", () => {
    expect(varsByParagraph(["평범한 묘사 문단."])).toEqual([{}]);
  });

  it("빈 body 는 빈 배열", () => {
    expect(varsByParagraph([])).toEqual([]);
    expect(varsByParagraph([], { 이름: "무명" })).toEqual([]);
  });

  it("set 이 하나도 없으면 모든 원소가 base 와 같은 내용", () => {
    const base = { 이름: "무명", n: 3 };
    expect(varsByParagraph(["첫 줄", "", "<<sfx 바스락>>셋째 줄"], base)).toEqual([
      { 이름: "무명", n: 3 },
      { 이름: "무명", n: 3 },
      { 이름: "무명", n: 3 },
    ]);
  });

  it("반환 길이는 body.length", () => {
    expect(varsByParagraph(["a", "b", "c", "d"])).toHaveLength(4);
  });

  it("base 를 변형하지 않는다", () => {
    const base = { 이름: "무명" };
    varsByParagraph(["<<set 이름 카엘>>", "<<set 성 하이든>>"], base);
    expect(base).toEqual({ 이름: "무명" });
  });

  it("원소끼리 참조를 공유하지 않는다", () => {
    const out = varsByParagraph(["앞", "뒤"], { 이름: "무명" });
    expect(out[0]).not.toBe(out[1]);
    out[0].끼어든키 = "x";
    expect(out[1]).toEqual({ 이름: "무명" });
  });

  it("한글 키가 parseScript 를 거쳐 실제로 치환된다", () => {
    const body = ["{{침식_손}}", "<<set 침식_손 3>>{{침식_손}}"];
    const vars = varsByParagraph(body);
    expect(parseScript(body[0], vars[0])).toEqual([{ kind: "text", text: "{{침식_손}}" }]);
    expect(parseScript(body[1], vars[1])).toEqual([
      { kind: "directive", cmd: "set", args: ["침식_손", "3"], raw: "set 침식_손 3" },
      { kind: "text", text: "3" },
    ]);
  });
});

/**
 * revealSchedule(body, stepMs) — 문단 i 가 열릴 시각(씬 진입 기준 ms).
 * 문단 0 은 0, 문단 i = i*stepMs + 문단 0..i-1 의 wait 합.
 */
describe("revealSchedule — 문단별 열림 시각", () => {
  it("wait 이 없으면 stepMs 등간격", () => {
    expect(revealSchedule(["첫 줄", "두 번째 줄", "세 번째 줄"], 700)).toEqual([0, 700, 1400]);
  });

  it("빈 body 는 빈 배열", () => {
    expect(revealSchedule([], 700)).toEqual([]);
  });

  it("문단 0 은 자기 wait 이 있어도 언제나 0", () => {
    expect(revealSchedule(["<<wait 600>>첫 줄"], 700)).toEqual([0]);
  });

  it("<<wait 600>> 은 그 다음 문단부터 민다", () => {
    expect(revealSchedule(["앞<<wait 600>>", "뒤", "그 다음"], 700)).toEqual([0, 1300, 2000]);
  });

  it("한 문단에 wait 이 여럿이면 전부 더한다", () => {
    expect(revealSchedule(["<<wait 100>><<wait 250>>앞", "뒤"], 700)).toEqual([0, 1050]);
  });

  it("인자 없는 <<wait>> 은 0", () => {
    expect(revealSchedule(["앞<<wait>>", "뒤"], 700)).toEqual([0, 700]);
  });

  it("숫자가 아닌 <<wait abc>> 는 0", () => {
    expect(revealSchedule(["앞<<wait abc>>", "뒤"], 700)).toEqual([0, 700]);
  });

  it("음수 <<wait -500>> 은 0", () => {
    expect(revealSchedule(["앞<<wait -500>>", "뒤"], 700)).toEqual([0, 700]);
  });

  it("<<wait 0>> 은 0", () => {
    expect(revealSchedule(["앞<<wait 0>>", "뒤"], 700)).toEqual([0, 700]);
  });

  it("<<wait Infinity>> 는 0 — 영원히 안 열리는 문단을 만들지 않는다", () => {
    expect(revealSchedule(["앞<<wait Infinity>>", "뒤"], 700)).toEqual([0, 700]);
  });

  it("<<waiting 600>> 은 wait 이 아니다 — 0", () => {
    expect(revealSchedule(["앞<<waiting 600>>", "뒤"], 700)).toEqual([0, 700]);
  });

  it("남는 인자는 무시하고 첫 인자만 읽는다", () => {
    expect(revealSchedule(["앞<<wait 600 900>>", "뒤"], 700)).toEqual([0, 1300]);
  });

  it("마지막 문단의 wait 은 아무 데도 안 쓰인다 — 오류도 아니다", () => {
    expect(revealSchedule(["앞", "뒤<<wait 9999>>"], 700)).toEqual([0, 700]);
  });

  it("stepMs 가 0 이어도 wait 은 그대로 쌓인다", () => {
    expect(revealSchedule(["앞<<wait 300>>", "뒤<<wait 200>>", "그 다음"], 0)).toEqual([0, 300, 500]);
  });

  it("wait 이 여러 문단에 흩어져 있으면 앞 문단 것만 누적한다", () => {
    expect(revealSchedule(["a<<wait 100>>", "b", "c<<wait 400>>", "d"], 700)).toEqual([
      0,
      800,
      1500,
      2600,
    ]);
  });

  it("반환 길이는 body.length", () => {
    expect(revealSchedule(["a", "b", "c", "d"], 700)).toHaveLength(4);
  });
});
