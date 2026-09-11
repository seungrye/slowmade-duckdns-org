// 분석을 쏠지 말지 (#469).
//
// 제보: GA 에서 `/games/eternia-refine` 접근이 비정상적으로 많다. 재 보니 nginx 가 본 실제
// 접근은 **34건뿐**이었고, 나머지는 내 e2e 였다 — `localhost:3099` 로 직접 붙어 nginx 를 안
// 거치는데, 그 빌드에는 `.env.local` 의 측정 ID 가 그대로 실려 있었다. e2e 한 바퀴가 그
// 페이지를 32번 연다.
//
// 판단만 여기로 뺀다. 실제 전송은 얇은 껍데기로 남긴다.

import { describe, it, expect } from 'vitest';
import { shouldTrack } from './analytics-gate';

const prod = { hostname: 'slowmade.duckdns.org', webdriver: false, measurementId: 'G-XXXX' };

describe('shouldTrack — 운영에서 사람이 볼 때만', () => {
  it('운영 호스트에서 사람이면 쏜다', () => {
    expect(shouldTrack(prod)).toBe(true);
    expect(shouldTrack({ ...prod, hostname: 'handmade.r-e.kr' })).toBe(true);
  });

  it('측정 ID 가 없으면 안 쏜다', () => {
    expect(shouldTrack({ ...prod, measurementId: undefined })).toBe(false);
    expect(shouldTrack({ ...prod, measurementId: '' })).toBe(false);
  });
});

describe('shouldTrack — 자동화는 뺀다', () => {
  it('자동화 브라우저면 운영 호스트라도 안 쏜다', () => {
    // Playwright·Selenium 은 navigator.webdriver 가 true 다. 이게 이번 제보의 원인이었다.
    expect(shouldTrack({ ...prod, webdriver: true })).toBe(false);
  });
});

describe('shouldTrack — 운영이 아닌 곳은 뺀다', () => {
  it('로컬에서는 안 쏜다', () => {
    for (const h of ['localhost', '127.0.0.1', '0.0.0.0', '::1']) {
      expect(shouldTrack({ ...prod, hostname: h }), h).toBe(false);
    }
  });

  it('사설망 주소에서도 안 쏜다 — 같은 망의 다른 기기로 열어 봐도 통계가 안 더러워진다', () => {
    for (const h of ['192.168.0.29', '10.0.0.5', '172.16.3.4']) {
      expect(shouldTrack({ ...prod, hostname: h }), h).toBe(false);
    }
  });

  it('모르는 호스트는 안 쏜다 — 허용 목록에 있는 곳만 센다', () => {
    for (const h of ['preview.vercel.app', 'evil.example.com', '']) {
      expect(shouldTrack({ ...prod, hostname: h }), h).toBe(false);
    }
  });
});
