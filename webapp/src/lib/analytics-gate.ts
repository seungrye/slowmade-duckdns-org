// 분석을 쏠지 말지 (#469) — 순수.
//
// 제보: GA 에서 특정 페이지 접근이 비정상적으로 많다. 재 보니 nginx 가 본 실제 접근은
// 34건뿐이었고 나머지는 e2e 였다. e2e 는 `localhost:3099` 로 Next 서버에 **직접** 붙어
// nginx 를 안 거치는데, 그 빌드에는 `.env.local` 의 측정 ID 가 그대로 실려 있었다.
// 한 바퀴가 한 페이지를 32번 연다.
//
// 예전 조건은 측정 ID 하나뿐이었다 — 있으면 어디서든 쐈다. 그래서 통계가 오염됐다.

/** 통계를 셀 곳. 여기 없는 호스트는 세지 않는다. */
const PRODUCTION_HOSTS = ['slowmade.duckdns.org', 'handmade.r-e.kr'] as const;

export interface TrackContext {
  /** `window.location.hostname`. */
  hostname: string;
  /** `navigator.webdriver` — Playwright·Selenium 이 true 로 둔다. */
  webdriver: boolean;
  /** `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`. */
  measurementId: string | undefined;
}

/**
 * 운영 호스트에서 **사람이** 볼 때만 센다.
 *
 * 허용 목록 방식이다 — 모르는 호스트(localhost, 사설망 주소, 미리보기 주소, 누가 띄운
 * 복제본)는 세지 않는다. 빠뜨려서 못 세는 것이 모르고 더럽히는 것보다 낫다.
 *
 * 처음엔 로컬 대역(`127.*`, `192.168.*` …)을 따로 걸렀는데, 변이 시험이 **그걸 지워도
 * 아무것도 안 깨진다**고 알려 줬다 — 허용 목록이 이미 막고 있어 죽은 코드였다.
 */
export function shouldTrack({ hostname, webdriver, measurementId }: TrackContext): boolean {
  if (!measurementId) return false;
  if (webdriver) return false; // 자동화 브라우저 — 이번 제보의 원인
  return (PRODUCTION_HOSTS as readonly string[]).includes(hostname);
}

/** 지금 브라우저에서 셀지 — 부수효과 경계. 서버에서는 늘 false. */
export function shouldTrackHere(): boolean {
  if (typeof window === 'undefined') return false;
  return shouldTrack({
    hostname: window.location.hostname,
    webdriver: Boolean(navigator.webdriver),
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  });
}
