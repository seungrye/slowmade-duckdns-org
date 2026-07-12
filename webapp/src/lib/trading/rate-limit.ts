// 브로커 API 전역 직렬화 — 프로세스 내 모든 호출을 최소 간격(기본 1초)으로 줄 세운다.
// 파이썬 kis/ratelimit.py 대응(평균이 아니라 매 호출 간 최소 간격). KIS 초당 2건·토스
// 그룹별 TPS 어느 쪽에도 안전한 보수값. 서버 전용.

const MIN_INTERVAL_MS = Number(process.env.TRADING_API_MIN_INTERVAL_MS ?? 1000);

let last = 0;
let chain: Promise<void> = Promise.resolve();

export function throttle(): Promise<void> {
  const next = chain.then(async () => {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
  });
  // 이전 호출이 실패해도 체인이 끊기지 않게 자체 catch 를 단 사본을 유지한다.
  chain = next.catch(() => undefined);
  return next;
}
