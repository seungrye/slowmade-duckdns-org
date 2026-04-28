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

  it('Node.js crypto 없이 Web Crypto API로 nonce를 생성한다', () => {
    // btoa(crypto.randomUUID()) — UUID는 36자이므로 base64 결과는 48자
    const res = middleware(makeRequest('/'));
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    const match = csp.match(/nonce-([A-Za-z0-9+/=]+)/);
    const nonce = match?.[1] ?? '';
    expect(nonce).toHaveLength(48);
    expect(() => atob(nonce)).not.toThrow();
  });

  it('요청마다 다른 nonce를 생성한다', () => {
    const csp1 = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    const csp2 = middleware(makeRequest('/')).headers.get('Content-Security-Policy') ?? '';
    expect(csp1).not.toBe(csp2);
  });
});
