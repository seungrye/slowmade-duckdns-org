// 스크린샷 통로의 순수 규칙 (#317).
//
// 러너가 "저도 파이프라인도 화면을 못 찍는다" 며 되묻고 있었다. `api.sh`·`db.mjs` 처럼
// 좁은 래퍼를 두되, **경로를 그대로 믿으면 안 된다** — 외부 URL 로 나가거나 주인 세션을
// 엉뚱한 곳에 붙이면 안 된다.
import { describe, it, expect } from 'vitest';
import { parseShotArgs, targetUrl, SIZES } from '../../../../scripts/ai-team/shot-args.mjs';

describe('parseShotArgs — 경로와 옵션', () => {
  it('경로 하나면 된다', () => {
    expect(parseShotArgs(['/games'])).toEqual({ path: '/games', owner: false, port: 0 });
  });

  it('앞 슬래시가 없으면 붙인다', () => {
    expect(parseShotArgs(['games'])?.path).toBe('/games');
  });

  it('--owner 로 주인 세션을 붙인다', () => {
    expect(parseShotArgs(['/', '--owner'])?.owner).toBe(true);
  });

  it('--port 로 다른 인스턴스를 겨눈다', () => {
    expect(parseShotArgs(['/', '--port', '3011'])?.port).toBe(3011);
  });

  it('질의문자열과 앵커는 그대로 둔다', () => {
    expect(parseShotArgs(['/games?tab=retro#top'])?.path).toBe('/games?tab=retro#top');
  });

  // 여기가 이 파서의 요점이다 — 밖으로 나가면 안 된다.
  it('외부 URL 은 거절한다', () => {
    for (const bad of ['http://evil.test/x', 'https://evil.test', '//evil.test/x', 'file:///etc/passwd']) {
      expect(parseShotArgs([bad])).toBeNull();
    }
  });

  it('상위 이동은 거절한다', () => {
    expect(parseShotArgs(['/../etc'])).toBeNull();
    expect(parseShotArgs(['/a/../../b'])).toBeNull();
  });

  it('경로가 없으면 null', () => {
    expect(parseShotArgs([])).toBeNull();
    expect(parseShotArgs(['--owner'])).toBeNull();
    expect(parseShotArgs()).toBeNull();
  });

  it('포트가 숫자가 아니거나 범위 밖이면 거절한다', () => {
    for (const p of ['abc', '0', '-1', '99999']) {
      expect(parseShotArgs(['/', '--port', p])).toBeNull();
    }
  });
});

describe('targetUrl — 호스트는 인자로 안 받는다', () => {
  it('--port 를 주면 그 로컬 인스턴스', () => {
    expect(targetUrl({ path: '/games', port: 3011 })).toBe('http://127.0.0.1:3011/games');
  });

  it('포트가 없으면 사이트 공개 주소', () => {
    expect(targetUrl({ path: '/games', port: 0 }, 'https://site.test')).toBe('https://site.test/games');
  });

  it('공개 주소 끝 슬래시를 정리한다', () => {
    expect(targetUrl({ path: '/', port: 0 }, 'https://site.test/')).toBe('https://site.test/');
  });
});

// 서버가 __Secure- 접두사 쿠키를 쓴다(실측). 그런 쿠키는 http 로 안 간다.
describe('주인 세션은 공개 주소로만', () => {
  it('--owner 와 --port 를 함께 주면 거절한다', () => {
    expect(parseShotArgs(['/', '--owner', '--port', '3011'])).toBeNull();
  });
});

describe('SIZES — 요청받은 두 크기', () => {
  it('데스크톱과 모바일 둘이다', () => {
    expect(SIZES.map((s) => s.name).sort()).toEqual(['desktop', 'mobile']);
  });

  it('모바일이 더 좁다', () => {
    const d = SIZES.find((s) => s.name === 'desktop')!;
    const m = SIZES.find((s) => s.name === 'mobile')!;
    expect(m.width).toBeLessThan(d.width);
  });
});
