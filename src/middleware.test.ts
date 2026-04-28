import { describe, it, expect } from 'vitest';
import { middleware } from './middleware';
import { NextRequest } from 'next/server';

function makeRequest(path = '/') {
  return new NextRequest(`http://localhost${path}`);
}

describe('middleware', () => {
  it('CSP 헤더를 응답에 설정한다', () => {
    const res = middleware(makeRequest('/'));
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });

  it("script-src에 'unsafe-inline'을 허용한다", () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
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
