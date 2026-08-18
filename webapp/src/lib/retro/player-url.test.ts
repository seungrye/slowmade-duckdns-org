import { describe, it, expect } from 'vitest';
import { PLAYER_PATH, buildPlayerUrl } from './player-url';

function params(url: string): URLSearchParams {
  return new URL(url, 'https://example.test').searchParams;
}

describe('retro/player-url — iframe 에 넘길 주소를 만든다', () => {
  it('코어와 롬을 쿼리로 싣는다', () => {
    const url = buildPlayerUrl({ core: 'snes9x', rom: '/games/retro/roms/a.sfc', name: 'Lan Master' });
    expect(url.startsWith(`${PLAYER_PATH}?`)).toBe(true);
    expect(params(url).get('core')).toBe('snes9x');
    expect(params(url).get('rom')).toBe('/games/retro/roms/a.sfc');
    expect(params(url).get('name')).toBe('Lan Master');
  });

  it('특수문자를 인코딩한다', () => {
    const url = buildPlayerUrl({ core: 'snes9x', rom: '/api/games/retro/roms/1/file/1.sfc', name: 'A&B ?=#' });
    expect(url).not.toContain(' ');
    expect(params(url).get('name')).toBe('A&B ?=#');
  });

  it('blob URL 도 그대로 실을 수 있다 — 내 컴퓨터 롬 바로 열기', () => {
    const blob = 'blob:https://example.test/9f0c-abc';
    expect(params(buildPlayerUrl({ core: 'snes9x', rom: blob })).get('rom')).toBe(blob);
  });

  it('지원하지 않는 코어는 거부한다 — 임의 문자열이 iframe 으로 새 나가지 않게', () => {
    expect(() => buildPlayerUrl({ core: 'pcsx_rearmed', rom: '/x.bin' })).toThrow();
    expect(() => buildPlayerUrl({ core: '', rom: '/x.sfc' })).toThrow();
  });

  it('롬 주소가 비면 거부한다', () => {
    expect(() => buildPlayerUrl({ core: 'snes9x', rom: '' })).toThrow();
  });

  it('외부 출처 롬은 거부한다 — 남의 서버 파일을 우리 플레이어로 트는 통로가 되면 안 된다', () => {
    expect(() => buildPlayerUrl({ core: 'snes9x', rom: 'https://evil.test/a.nes' })).toThrow();
    expect(() => buildPlayerUrl({ core: 'snes9x', rom: '//evil.test/a.nes' })).toThrow();
  });

  describe('패치 (#112)', () => {
    it('패치 주소를 함께 싣는다', () => {
      const url = buildPlayerUrl({
        core: 'snes9x',
        rom: '/api/games/retro/roms/1/file/1.sfc',
        patch: '/api/games/retro/roms/1/patches/2/file',
      });
      expect(params(url).get('patch')).toBe('/api/games/retro/roms/1/patches/2/file');
    });

    it('패치가 없으면 파라미터 자체가 없다', () => {
      const url = buildPlayerUrl({ core: 'snes9x', rom: '/x.sfc' });
      expect(params(url).has('patch')).toBe(false);
      expect(params(url).has('strip')).toBe(false);
    });

    it('헤더 처리 지시를 실어 보낸다 — IPS 는 자동 판별이 안 되므로 사용자가 정한다', () => {
      const base = { core: 'snes9x', rom: '/x.sfc', patch: '/p.ips' };
      expect(params(buildPlayerUrl({ ...base, stripHeader: true })).get('strip')).toBe('1');
      expect(params(buildPlayerUrl({ ...base, stripHeader: false })).get('strip')).toBe('0');
      // 지정하지 않으면 플레이어가 알아서 판단하도록 비워 둔다.
      expect(params(buildPlayerUrl(base)).has('strip')).toBe(false);
    });

    it('외부 출처 패치는 거부한다 — 롬과 같은 이유', () => {
      expect(() => buildPlayerUrl({ core: 'snes9x', rom: '/x.sfc', patch: 'https://evil.test/p.ips' })).toThrow();
      expect(() => buildPlayerUrl({ core: 'snes9x', rom: '/x.sfc', patch: '//evil.test/p.ips' })).toThrow();
    });
  });
});

// #175 — 옛 이름의 게임 세이브를 되살릴지는 서버가 판단해 플래그로 넘긴다.
describe('buildPlayerUrl — 옛 세이브 복원 플래그', () => {
  const base = { core: 'snes9x', rom: '/api/games/retro/roms/1/file/1.sfc' };

  it('대상이면 legacy=1 을 싣는다', () => {
    expect(buildPlayerUrl({ ...base, legacySave: true })).toContain('legacy=1');
  });

  it('대상이 아니면 아예 싣지 않는다', () => {
    expect(buildPlayerUrl({ ...base, legacySave: false })).not.toContain('legacy');
    expect(buildPlayerUrl(base)).not.toContain('legacy');
  });
});

// #186 — netplay 로 열기. 방을 가르는 것은 게임 번호이므로, 두 PC 가 같은 수를 받아야 한다.
describe('buildPlayerUrl — netplay', () => {
  const base = { core: 'snes9x', rom: '/api/games/retro/roms/1/file/1.sfc' };

  it('켜면 np=1 과 게임 번호를 싣는다', () => {
    const url = buildPlayerUrl({ ...base, netplay: true, gameKeyForNetplay: 'rom:abc' });
    expect(url).toContain('np=1');
    expect(url).toMatch(/gid=\d+/);
  });

  it('같은 게임 키면 같은 번호 — 두 PC 가 같은 방에 들어간다', () => {
    const a = buildPlayerUrl({ ...base, netplay: true, gameKeyForNetplay: 'rom:abc' });
    const b = buildPlayerUrl({ ...base, netplay: true, gameKeyForNetplay: 'rom:abc' });
    expect(a).toBe(b);
  });

  it('다른 게임이면 다른 번호', () => {
    const a = buildPlayerUrl({ ...base, netplay: true, gameKeyForNetplay: 'rom:abc' });
    const b = buildPlayerUrl({ ...base, netplay: true, gameKeyForNetplay: 'rom:xyz' });
    expect(a).not.toBe(b);
  });

  it('게임 키가 없으면 세이브 키로 갈음한다 — 그래도 두 PC 가 일치한다', () => {
    const a = buildPlayerUrl({ ...base, netplay: true, saveKey: 'rom:abc' });
    const b = buildPlayerUrl({ ...base, netplay: true, gameKeyForNetplay: 'rom:abc' });
    expect(new URL(a, 'http://x').searchParams.get('gid'))
      .toBe(new URL(b, 'http://x').searchParams.get('gid'));
  });

  it('끄면 아무것도 싣지 않는다', () => {
    const url = buildPlayerUrl(base);
    expect(url).not.toContain('np=');
    expect(url).not.toContain('gid=');
  });
});
