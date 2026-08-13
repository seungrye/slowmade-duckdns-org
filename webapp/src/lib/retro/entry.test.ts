import { describe, it, expect } from 'vitest';
import { builtinEntry, romEntry } from './entry';

const BUILTIN = {
  slug: 'lan-master',
  title: 'Lan Master',
  platform: 'snes' as const,
  file: 'lan-master.sfc',
  source: 'https://example.test/lan-master',
  license: 'Freeware',
  description: '케이블을 잇는 퍼즐.',
};

const ROM = {
  id: '653f1a2b3c4d5e6f70819202',
  title: '내가 올린 롬',
  platform: 'snes' as const,
  size: 4 * 1024 * 1024,
  createdAt: '2026-08-12T00:00:00.000Z',
};

describe('retro/entry — 기본 제공 게임과 업로드 롬을 한 모양으로 만든다', () => {
  it('기본 제공 게임', () => {
    const e = builtinEntry(BUILTIN);
    expect(e.key).toBe('builtin:lan-master');
    expect(e.source).toBe('builtin');
    expect(e.playHref).toBe('/games/retro/play/builtin/lan-master');
    expect(e.romUrl).toBe('/games/retro/roms/lan-master.sfc');
    expect(e.platform).toBe('snes');
  });

  it('업로드 롬 — 파일은 인증 프록시로만 받는다', () => {
    const e = romEntry(ROM);
    expect(e.key).toBe('rom:653f1a2b3c4d5e6f70819202');
    expect(e.source).toBe('rom');
    expect(e.playHref).toBe('/games/retro/play/rom/653f1a2b3c4d5e6f70819202');
    // 공개 /s3/ URL 을 쓰면 링크만으로 남이 받을 수 있다. 반드시 API 경유.
    expect(e.romUrl).toBe('/api/games/retro/roms/653f1a2b3c4d5e6f70819202/file/653f1a2b3c4d5e6f70819202.sfc');
    expect(e.romUrl).not.toContain('/s3/');
  });

  it('키가 출처를 포함해 두 목록을 합쳐도 충돌하지 않는다', () => {
    const same = builtinEntry({ ...BUILTIN, slug: 'x' });
    const other = romEntry({ ...ROM, id: 'x' });
    expect(same.key).not.toBe(other.key);
  });

  it('업로드 롬은 크기를 사람이 읽는 부제로 보여준다', () => {
    expect(romEntry(ROM).subtitle).toContain('4');
    expect(romEntry(ROM).subtitle).toContain('MB');
  });

  // #137 — EmulatorJS 는 URL 의 마지막 조각을 브라우저 캐시 키로 쓴다.
  describe('롬 주소가 캐시 키를 가른다', () => {
    it('주소 끝이 롬마다 다르다 — 예전엔 모두 "file" 이라 겹쳤다', () => {
      const a = romEntry({ ...ROM, id: '653f1a2b3c4d5e6f70810001' });
      const b = romEntry({ ...ROM, id: '653f1a2b3c4d5e6f70810002' });
      const last = (u: string) => u.split('/').pop();
      expect(last(a.romUrl)).not.toBe(last(b.romUrl));
      expect(last(a.romUrl)).toContain('653f1a2b3c4d5e6f70810001');
    });

    it('기종에 맞는 확장자로 끝난다 — 코어의 가상 파일명에도 붙는다', () => {
      expect(romEntry({ ...ROM, platform: 'snes' }).romUrl.endsWith('.sfc')).toBe(true);
    });
  });

  // #139 — 아케이드는 zip 이름이 곧 게임 이름이다. 바꾸면 코어가 못 찾는다.
  describe('아케이드(CPS2)', () => {
    it('원본 파일명을 그대로 주소에 쓴다', () => {
      const e = romEntry({ ...ROM, platform: 'cps2', filename: 'ssf2t.zip' });
      expect(e.romUrl.endsWith('/ssf2t.zip')).toBe(true);
    });

    it('이름에 특수문자가 있어도 안전하게 인코딩한다', () => {
      const e = romEntry({ ...ROM, platform: 'cps2', filename: 'a b&c.zip' });
      expect(e.romUrl).not.toContain(' ');
      expect(decodeURIComponent(e.romUrl.split('/').pop()!)).toBe('a b&c.zip');
    });

    it('파일명을 모르면 id 로 되돌아간다 — 주소가 깨지지 않게', () => {
      const e = romEntry({ ...ROM, platform: 'cps2' });
      expect(e.romUrl.endsWith('.zip')).toBe(true);
      expect(e.romUrl).toContain(ROM.id);
    });
  });

  // #141 — 실제로 겪은 사고: 플레이 화면이 filename 을 안 넘겨 주소가 `<id>.zip` 이 됐고,
  // 아케이드 코어가 롬셋을 못 알아봐 RetroArch 메뉴만 떴다.
  describe('아케이드 롬 주소는 파일명을 잃으면 안 된다', () => {
    it('파일명을 주면 반드시 주소 끝에 실린다', () => {
      const e = romEntry({ ...ROM, platform: 'cps2', filename: 'ddsoma.zip' });
      expect(e.romUrl.endsWith('/ddsoma.zip')).toBe(true);
    });

    it('SNES 는 파일명을 줘도 id 규칙을 쓴다 — 캐시 키가 확실히 갈리도록', () => {
      const e = romEntry({ ...ROM, platform: 'snes', filename: 'Tales.sfc' });
      expect(e.romUrl.endsWith(`/${ROM.id}.sfc`)).toBe(true);
    });
  });
});
