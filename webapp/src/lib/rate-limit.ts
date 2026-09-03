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

/**
 * 프록시 뒤 클라이언트 IP 추출 (#386).
 *
 * ⚠ **X-Forwarded-For 첫 항목을 쓰면 안 된다.** nginx 는
 * `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` 로 클라이언트가 보낸 XFF
 * 에 실제 IP 를 **이어붙인다** — 그래서 첫 항목은 공격자가 넣은 값이고, 그걸 버킷 키로 쓰면
 * XFF 를 매번 바꿔 레이트리밋을 우회할 수 있다.
 *
 * 우선순위:
 *  1. `X-Real-IP` — nginx 가 `$remote_addr`(TCP 피어)로 세팅한다. `proxy_set_header` 는
 *     클라이언트가 보낸 같은 헤더를 **덮어쓰므로** 위조 불가하다(단일 엣지 프록시 전제).
 *  2. XFF 의 **마지막** 항목 — nginx 가 붙인 실제 IP. X-Real-IP 가 없는 경로의 폴백.
 *  3. 'unknown'.
 */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
