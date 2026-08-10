// 엔딩 전송 재시도 큐 — 앱이 전송 직후 종료되거나 오프라인이면 회차가 유실됐다.
// 전송 전에 큐에 넣고, 성공해야 지운다. 다음 실행에서 남은 걸 재전송. (#61)
import { describe, it, expect, beforeEach } from "vitest";
import {
  QUEUE_KEY,
  MAX_QUEUED,
  readQueue,
  enqueue,
  remove,
  flushQueue,
} from "../src/end-run-queue.js";

/** localStorage 흉내 — 테스트에서 상태를 직접 들여다보려고 Map 기반. */
function fakeStorage(initial) {
  const m = new Map(initial ? Object.entries(initial) : []);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _dump: () => m,
  };
}

describe("큐 적재/삭제", () => {
  let st;
  beforeEach(() => { st = fakeStorage(); });

  it("enqueue 하면 payload 가 담기고 id 를 돌려준다", () => {
    const id = enqueue(st, { endingId: "petrification" }, "id-1");
    expect(id).toBe("id-1");
    const q = readQueue(st);
    expect(q).toHaveLength(1);
    expect(q[0].payload.endingId).toBe("petrification");
  });

  it("remove 로 해당 항목만 지운다", () => {
    enqueue(st, { endingId: "a" }, "id-1");
    enqueue(st, { endingId: "b" }, "id-2");
    remove(st, "id-1");
    expect(readQueue(st).map((x) => x.payload.endingId)).toEqual(["b"]);
  });

  it("id 를 안 주면 자동 생성되고 서로 다르다", () => {
    const a = enqueue(st, { endingId: "a" });
    const b = enqueue(st, { endingId: "b" });
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("MAX_QUEUED 를 넘으면 오래된 것부터 버린다", () => {
    for (let i = 0; i < MAX_QUEUED + 5; i++) enqueue(st, { endingId: "e" + i }, "id-" + i);
    const q = readQueue(st);
    expect(q).toHaveLength(MAX_QUEUED);
    expect(q[q.length - 1].payload.endingId).toBe("e" + (MAX_QUEUED + 4)); // 최신 유지
  });

  // 저장소가 깨져도 게임이 멈추면 안 된다.
  it("손상된 JSON 이면 빈 큐로 취급", () => {
    const bad = fakeStorage({ [QUEUE_KEY]: "{not json" });
    expect(readQueue(bad)).toEqual([]);
  });

  it("storage 가 없거나 던져도 크래시하지 않는다", () => {
    expect(readQueue(null)).toEqual([]);
    const boom = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(readQueue(boom)).toEqual([]);
    expect(() => enqueue(boom, { endingId: "a" }, "i")).not.toThrow();
  });
});

describe("flushQueue", () => {
  let st;
  beforeEach(() => { st = fakeStorage(); });

  it("전송에 성공한 항목만 큐에서 빠진다", async () => {
    enqueue(st, { endingId: "ok" }, "id-ok");
    enqueue(st, { endingId: "ng" }, "id-ng");
    const submit = async (p) => p.endingId === "ok";

    const r = await flushQueue({ storage: st, submit });

    expect(r).toEqual({ total: 2, sent: 1 });
    expect(readQueue(st).map((x) => x.id)).toEqual(["id-ng"]); // 실패분은 다음 기회에
  });

  it("모두 성공하면 큐가 빈다", async () => {
    enqueue(st, { endingId: "a" }, "1");
    enqueue(st, { endingId: "b" }, "2");
    const r = await flushQueue({ storage: st, submit: async () => true });
    expect(r.sent).toBe(2);
    expect(readQueue(st)).toEqual([]);
  });

  it("빈 큐면 전송을 시도하지 않는다", async () => {
    let calls = 0;
    const r = await flushQueue({ storage: st, submit: async () => { calls++; return true; } });
    expect(calls).toBe(0);
    expect(r).toEqual({ total: 0, sent: 0 });
  });

  it("submit 이 예외를 던져도 큐를 지키고 계속 진행", async () => {
    enqueue(st, { endingId: "boom" }, "1");
    enqueue(st, { endingId: "ok" }, "2");
    const submit = async (p) => {
      if (p.endingId === "boom") throw new Error("network");
      return true;
    };

    const r = await flushQueue({ storage: st, submit });

    expect(r.sent).toBe(1);
    expect(readQueue(st).map((x) => x.id)).toEqual(["1"]); // 예외분은 남는다
  });
});
