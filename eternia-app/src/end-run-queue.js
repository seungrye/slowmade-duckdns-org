// 엔딩 전송 재시도 큐.
//
// 왜 필요한가: showEndingCard 는 submitAppEndRun 을 await 하지 않는다(fire-and-forget).
// 엔딩 카드를 보고 곧바로 앱을 닫으면 요청이 완료되기 전에 프로세스가 죽어 회차가 통째로
// 사라진다. 오프라인이어도 마찬가지다. 실제로 석화 엔딩 한 회차가 그렇게 유실됐다.
//
// 그래서 "전송 전에 큐에 넣고, 성공해야 지운다". 남은 항목은 다음 실행에서 재전송한다.
// 저장소 오류·손상 데이터는 모두 삼킨다 — 큐 때문에 게임이 멈추면 안 된다.
//
// 트레이드오프: 서버에 도달했지만 응답을 못 받은 경우 다음 실행에 중복 전송될 수 있다.
// 유실보다 중복이 낫다고 보고 감수한다(작가가 보고 판단할 수 있으므로).

export const QUEUE_KEY = "eternia.pendingEndRuns";
export const MAX_QUEUED = 20; // 오래 오프라인이어도 무한정 쌓이지 않게

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 저장된 큐를 읽는다. 없거나 깨졌으면 빈 배열. */
export function readQueue(storage) {
  try {
    const raw = storage && storage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x && x.id) : [];
  } catch {
    return [];
  }
}

function writeQueue(storage, items) {
  try {
    if (!storage) return;
    storage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUED)));
  } catch {
    /* 용량 초과·비활성 저장소 */
  }
}

/** 전송 전에 적재. 돌려준 id 로 성공 후 remove 한다. */
export function enqueue(storage, payload, id) {
  const entry = { id: id || makeId(), at: Date.now(), payload };
  writeQueue(storage, [...readQueue(storage), entry]);
  return entry.id;
}

export function remove(storage, id) {
  writeQueue(storage, readQueue(storage).filter((x) => x.id !== id));
}

/**
 * 남아 있는 항목을 순서대로 재전송. 성공한 것만 큐에서 뺀다.
 * @param submit (payload) => Promise<boolean>  true 면 서버가 받은 것
 * @returns {Promise<{total:number, sent:number}>}
 */
export async function flushQueue({ storage, submit }) {
  const items = readQueue(storage);
  let sent = 0;
  for (const item of items) {
    let ok = false;
    try {
      ok = await submit(item.payload);
    } catch {
      ok = false; // 다음 실행에서 다시 시도
    }
    if (ok) {
      remove(storage, item.id);
      sent++;
    }
  }
  return { total: items.length, sent };
}
