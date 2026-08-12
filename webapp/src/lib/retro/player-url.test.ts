import { describe, it, expect } from 'vitest';
import { PLAYER_PATH, buildPlayerUrl } from './player-url';

function params(url: string): URLSearchParams {
  return new URL(url, 'https://example.test').searchParams;
}

describe('retro/player-url — iframe 에 넘길 주소를 만든다', () => {
  it('코어와 롬을 쿼리로 싣는다', () => {
    const url = buildPlayerUrl({ core: 'fceumm', rom: '/games/retro/roms/a.nes', name: 'Lan Master' });
    expect(url.startsWith(`${PLAYER_PATH}?`)).toBe(true);
    expect(params(url).get('core')).toBe('fceumm');
    expect(params(url).get('rom')).toBe('/games/retro/roms/a.nes');
    expect(params(url).get('name')).toBe('Lan Master');
  });

  it('특수문자를 인코딩한다', () => {
    const url = buildPlayerUrl({ core: 'mgba', rom: '/api/games/retro/roms/1/file', name: 'A&B ?=#' });
    expect(url).not.toContain(' ');
    expect(params(url).get('name')).toBe('A&B ?=#');
  });

  it('blob URL 도 그대로 실을 수 있다 — 내 컴퓨터 롬 바로 열기', () => {
    const blob = 'blob:https://example.test/9f0c-abc';
    expect(params(buildPlayerUrl({ core: 'snes9x', rom: blob })).get('rom')).toBe(blob);
  });

  it('지원하지 않는 코어는 거부한다 — 임의 문자열이 iframe 으로 새 나가지 않게', () => {
    expect(() => buildPlayerUrl({ core: 'pcsx_rearmed', rom: '/x.bin' })).toThrow();
    expect(() => buildPlayerUrl({ core: '', rom: '/x.nes' })).toThrow();
  });

  it('롬 주소가 비면 거부한다', () => {
    expect(() => buildPlayerUrl({ core: 'fceumm', rom: '' })).toThrow();
  });

  it('외부 출처 롬은 거부한다 — 남의 서버 파일을 우리 플레이어로 트는 통로가 되면 안 된다', () => {
    expect(() => buildPlayerUrl({ core: 'fceumm', rom: 'https://evil.test/a.nes' })).toThrow();
    expect(() => buildPlayerUrl({ core: 'fceumm', rom: '//evil.test/a.nes' })).toThrow();
  });
});
