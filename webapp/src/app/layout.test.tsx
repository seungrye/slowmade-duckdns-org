import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * #230 — Nanum Gothic Coding 폰트를 *Google CDN 직접 link* 로 변경.
 *
 * 이전 #228 은 `next/font/google` 의 `Nanum_Gothic_Coding` 으로 *self-host*
 * 하였으나, Next.js 가 자동으로 `<link rel="preload" href="/_next/static/media/*.woff2">`
 * 를 추가하면서 응답 헤더 크기가 폭주 → nginx 502 가 발생하였다.
 *
 * 사용자 의도: "클라이언트에서 구글에 접속해서 폰트 서빙 받으면 되잖아." — 사이트
 * 트래픽/리소스를 낭비하지 않는 *Google Fonts CDN 직접 link* 전략으로 회귀.
 *
 * 검증: layout.tsx 의 텍스트를 직접 읽어 다음을 검사한다.
 *   1) next/font/google 의 `Nanum_Gothic_Coding` import 가 *제거*.
 *   2) <head> 에 fonts.googleapis.com / fonts.gstatic.com preconnect 2개.
 *   3) <head> 에 Nanum+Gothic+Coding 스타일시트 link.
 *   4) <html> className 에서 `nanumGothicCoding.variable` 참조가 제거.
 */
const projectRoot = resolve(__dirname, '../..');
const layoutTsx = readFileSync(
  resolve(projectRoot, 'src/app/layout.tsx'),
  'utf-8',
);

describe('#230 layout.tsx — Google Fonts CDN 직접 link', () => {
  it('next/font/google 의 Nanum_Gothic_Coding import 가 제거된다', () => {
    expect(layoutTsx).not.toMatch(/from\s*["']next\/font\/google["']/);
    expect(layoutTsx).not.toMatch(/Nanum_Gothic_Coding/);
  });

  it('<head> 에 fonts.googleapis.com preconnect link 가 존재한다', () => {
    expect(layoutTsx).toMatch(
      /<link[^>]*rel=["']preconnect["'][^>]*href=["']https:\/\/fonts\.googleapis\.com["']/,
    );
  });

  it('<head> 에 fonts.gstatic.com preconnect link 가 (crossOrigin 과 함께) 존재한다', () => {
    expect(layoutTsx).toMatch(
      /<link[^>]*rel=["']preconnect["'][^>]*href=["']https:\/\/fonts\.gstatic\.com["'][^>]*crossOrigin/,
    );
  });

  it('<head> 에 Nanum+Gothic+Coding 스타일시트 link 가 존재한다 (400 + 700 weight + display=swap)', () => {
    expect(layoutTsx).toMatch(
      /<link[^>]*href=["']https:\/\/fonts\.googleapis\.com\/css2\?family=Nanum\+Gothic\+Coding:wght@400;700&display=swap["'][^>]*rel=["']stylesheet["']/,
    );
  });

  it('<html> className 에서 nanumGothicCoding.variable 참조가 제거된다', () => {
    expect(layoutTsx).not.toMatch(/nanumGothicCoding\.variable/);
  });
});
