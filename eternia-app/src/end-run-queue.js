// The ending-submission retry queue.
//
// Why it is needed: showEndingCard does not await submitAppEndRun (fire-and-forget).
// Closing the app right after seeing the ending card kills the process before the request completes and the whole run
// disappears. The same happens offline. One petrification-ending run was actually lost that way.
//
// So it is "queued before sending, and removed only on success". What remains is resent on the next launch.
// Storage errors and corrupt data are all swallowed - the queue must never stall the game.
//
// The trade-off: something that reached the server but whose response was lost may be sent twice on the next launch.
// A duplicate is judged better than a loss, so it is accepted (the author can look and decide).

export const QUEUE_KEY = "eternia.pendingEndRuns";
export const MAX_QUEUED = 20; // So a long spell offline does not pile up without limit

/** The run's unique id. It identifies the queue entry and is sent as the server's idempotency key (clientRunId). (#63) */
export function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Reads the stored queue. An empty array when absent or broken. */
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

/** Enqueued before sending. The returned id is used to remove it after success. */
export function enqueue(storage, payload, id) {
  const entry = { id: id || makeId(), at: Date.now(), payload };
  writeQueue(storage, [...readQueue(storage), entry]);
  return entry.id;
}

export function remove(storage, id) {
  writeQueue(storage, readQueue(storage).filter((x) => x.id !== id));
}

/**
 * Resends the remaining entries in order. Only the successful ones leave the queue.
 * @param submit (payload) => Promise<boolean>  true means the server received it
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
      ok = false; // tried again on the next launch
    }
    if (ok) {
      remove(storage, item.id);
      sent++;
    }
  }
  return { total: items.length, sent };
}
