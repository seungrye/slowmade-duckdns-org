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

  it("script-src에 nonce를 포함하고 script-src에는 unsafe-inline이 없다", () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    const scriptSrc = csp.split(';').find(d => d.trim().startsWith('script-src')) ?? '';
    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).toContain('https://cdn.jsdelivr.net');
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it('요청마다 서로 다른 nonce를 생성한다', () => {
    const csp1 = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    const csp2 = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    const nonce1 = csp1.match(/'nonce-([^']+)'/)?.[1];
    const nonce2 = csp2.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce1).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });

  it("style-src에 'unsafe-inline'을 허용한다", () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('frame-ancestors를 none으로 설정한다', () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('img-src에 https:를 허용한다', () => {
    const csp = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("img-src 'self' blob: data: https:");
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
