// 간단한 인메모리 슬라이딩 윈도우 rate limit — 공개 엔드포인트(댓글 등) 스팸/DoS 완화용.
// 단일 활성 인스턴스(홈서버 / Blue-Green 한쪽만 트래픽)에 적합. 배포 시 카운터 리셋되지만
// 남용 억제 목적엔 충분. 다중 인스턴스 정확성이 필요하면 Redis/Mongo 백엔드로 교체.

const buckets = new Map<string, number[]>();

/**
 * key 에 대해 windowMs 동안 limit 회까지 허용. 허용이면 true(요청 기록), 초과면 false.
 * @param nowMs 현재 시각(주입 가능 — 테스트용). 기본 Date.now().
 */
export function rateLimit(key: string, limit: number, windowMs: number, nowMs: number = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => nowMs - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent); // 오래된 것 정리한 상태로 유지
    return false;
  }
  recent.push(nowMs);
  buckets.set(key, recent);
  return true;
}

/** 테스트/운영 초기화용. */
export function __resetRateLimit(): void {
  buckets.clear();
}

/** 프록시 뒤 클라이언트 IP 추출(x-forwarded-for 첫 항목). 없으면 'unknown'. */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")?.trim()
    || "unknown";
}
