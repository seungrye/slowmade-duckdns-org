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
    // Asserted per token - so the middleware's policy stays flexible as entries are added.
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
  // A matcher hit makes Next buffer the request body and cap it at 10MB by default -> FormData parsing fails (500).
  // Large-upload routes must be excluded in the matcher's negative lookahead. The match is reproduced with the source regex.
  const source = (config.matcher as { source: string }[])[0].source;
  const re = new RegExp('^' + source + '$');

  it('첨부/오디오 업로드 라우트는 제외(middleware 미적용)', () => {
    expect(re.test('/api/attachment/upload')).toBe(false);
    expect(re.test('/api/web-adventure/audio/upload')).toBe(false);
  });

  it('일반 경로·기타 API 는 여전히 적용', () => {
    expect(re.test('/post/write')).toBe(true);
    expect(re.test('/api/submit')).toBe(true);
    expect(re.test('/api/upload')).toBe(true); // images (gated at 5MB on the client) stay as they were
    expect(re.test('/admin/x')).toBe(true);
  });

  // #109 - the CSP is lowered in two places for the retro emulator player document alone.
  describe('레트로 플레이어 iframe (/games/retro/player.html)', () => {
    const PLAYER = '/games/retro/player.html';
    const cspOf = (path: string) =>
      middleware(makeRequest(path)).headers.get('Content-Security-Policy') ?? '';

    it('플레이어는 same-origin 에서 감쌀 수 있다 — frame-ancestors 가 self', () => {
      expect(cspOf(PLAYER)).toMatch(/frame-ancestors 'self'/);
    });

    it('플레이어에는 unsafe-eval 을 준다 — 없으면 코어 7z 해제가 통째로 막힌다', () => {
      // EmulatorJS's emscripten glue calls cwrap("extract","number",["string"]), and
      // a string argument makes it build the wrapper through eval. wasm-unsafe-eval is not enough.
      expect(cspOf(PLAYER)).toMatch(/script-src [^;]*'unsafe-eval'/);
    });

    it('플레이어에는 blob: 을 준다 — 코어를 푼 뒤 Blob 스크립트로 싣고 fetch 로 읽는다', () => {
      // These values were confirmed by running five systems headlessly. Opening only one of the two stalls the boot.
      const csp = cspOf(PLAYER);
      expect(csp).toMatch(/script-src [^;]*blob:/);
      expect(csp).toMatch(/connect-src [^;]*blob:/);
    });

    it('플레이어에서도 cdn.emulatorjs.org 로는 못 나간다 — 자체 호스팅이 목적이다', () => {
      expect(cspOf(PLAYER)).not.toContain('cdn.emulatorjs.org');
    });

    it('다른 경로는 종전대로 — 완화가 새 나가지 않는다', () => {
      const csp = cspOf('/');
      expect(csp).toMatch(/frame-ancestors 'none'/);
      expect(csp).not.toMatch(/script-src [^;]*'unsafe-eval'/);
      // wasm-unsafe-eval is a separate token that does not include unsafe-eval (it is for bevy-rogue).
      expect(csp).toMatch(/script-src [^;]*'wasm-unsafe-eval'/);
      expect(csp).not.toMatch(/script-src [^;]*blob:/);
      expect(csp).not.toMatch(/connect-src [^;]*blob:/);
    });

    it('비슷한 이름의 다른 경로에는 적용되지 않는다', () => {
      expect(cspOf('/games/retro/player.html.bak')).toMatch(/frame-ancestors 'none'/);
      expect(cspOf('/games/retro')).toMatch(/frame-ancestors 'none'/);
    });
  });
});
