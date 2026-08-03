import { describe, it, expect } from 'vitest';
import { middleware, config } from './middleware';
import { NextRequest } from 'next/server';

function makeRequest(path = '/') {
  return new NextRequest(`http://localhost${path}`);
}

describe('middleware', () => {
  it('CSP 헤더를 응답에 설정한다', () => {
    const res = middleware(makeRequest('/'));
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it("script-src에 'unsafe-inline'과 cdn.jsdelivr.net, googletagmanager.com을 허용한다", () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    // 개별 토큰으로 단언 — 미들웨어 정책이 항목 추가에 유연하도록.
    expect(csp).toMatch(/script-src [^;]*'self'/);
    expect(csp).toMatch(/script-src [^;]*'unsafe-inline'/);
    expect(csp).toMatch(/script-src [^;]*https:\/\/cdn\.jsdelivr\.net/);
    expect(csp).toMatch(/script-src [^;]*https:\/\/www\.googletagmanager\.com/);
  });

  it("script-src에 'wasm-unsafe-eval' 을 허용한다 (bevy-rogue WASM)", () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/script-src [^;]*'wasm-unsafe-eval'/);
  });

  it("style-src에 'unsafe-inline'을 허용한다", () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('nonce를 생성하지 않는다', () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).not.toContain('nonce-');
  });

  it('frame-ancestors를 none으로 설정한다', () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('img-src에 https:를 허용한다', () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("img-src 'self' blob: data: https:");
  });

  it('connect-src에 Firebase, Google Analytics, Performance 도메인을 허용한다', () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain('connect-src');
    expect(csp).toContain('https://firebase.googleapis.com');
    expect(csp).toContain('https://firebaseremoteconfig.googleapis.com');
    expect(csp).toContain('https://www.google-analytics.com');
    expect(csp).toContain('https://firebaselogging.googleapis.com');
    expect(csp).toContain('https://firebaselogging-pa.googleapis.com');
  });

  it("worker-src에 blob:을 허용한다", () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it('API 경로에도 CSP를 설정한다', () => {
    const csp = middleware(makeRequest('/api/posts')).headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
  });

  it('HSTS 헤더를 설정한다', () => {
    const res = middleware(makeRequest('/'));
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('X-Content-Type-Options 헤더를 설정한다', () => {
    const res = middleware(makeRequest('/'));
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('Referrer-Policy 헤더를 설정한다', () => {
    const res = middleware(makeRequest('/'));
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('Permissions-Policy 헤더를 설정한다', () => {
    const res = middleware(makeRequest('/'));
    expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
  });
});

describe('middleware matcher — 대용량 업로드 라우트 제외', () => {
  // matcher 가 매칭하면 Next 가 요청 본문을 버퍼링하며 기본 10MB 로 제한 → FormData 파싱 실패(500).
  // 대용량 업로드 라우트는 matcher 의 negative-lookahead 에서 제외해야 한다. source 정규식으로 매칭 재현.
  const source = (config.matcher as { source: string }[])[0].source;
  const re = new RegExp('^' + source + '$');

  it('첨부/오디오 업로드 라우트는 제외(middleware 미적용)', () => {
    expect(re.test('/api/attachment/upload')).toBe(false);
    expect(re.test('/api/web-adventure/audio/upload')).toBe(false);
  });

  it('일반 경로·기타 API 는 여전히 적용', () => {
    expect(re.test('/post/write')).toBe(true);
    expect(re.test('/api/submit')).toBe(true);
    expect(re.test('/api/upload')).toBe(true); // 이미지(클라 5MB 게이트)는 그대로
    expect(re.test('/admin/x')).toBe(true);
  });
});
