import { describe, it, expect } from 'vitest';
import { builtinEntry, romEntry } from './entry';

const BUILTIN = {
  slug: 'lan-master',
  title: 'Lan Master',
  platform: 'nes' as const,
  file: 'lan-master.nes',
  source: 'https://example.test/lan-master',
  license: 'Freeware',
  description: '케이블을 잇는 퍼즐.',
};

const ROM = {
  id: '653f1a2b3c4d5e6f70819202',
  title: '내가 올린 롬',
  platform: 'gba' as const,
  size: 4 * 1024 * 1024,
  createdAt: '2026-08-12T00:00:00.000Z',
};

describe('retro/entry — 기본 제공 게임과 업로드 롬을 한 모양으로 만든다', () => {
  it('기본 제공 게임', () => {
    const e = builtinEntry(BUILTIN);
    expect(e.key).toBe('builtin:lan-master');
    expect(e.source).toBe('builtin');
    expect(e.playHref).toBe('/games/retro/play/builtin/lan-master');
    expect(e.romUrl).toBe('/games/retro/roms/lan-master.nes');
    expect(e.platform).toBe('nes');
  });

  it('업로드 롬 — 파일은 인증 프록시로만 받는다', () => {
    const e = romEntry(ROM);
    expect(e.key).toBe('rom:653f1a2b3c4d5e6f70819202');
    expect(e.source).toBe('rom');
    expect(e.playHref).toBe('/games/retro/play/rom/653f1a2b3c4d5e6f70819202');
    // 공개 /s3/ URL 을 쓰면 링크만으로 남이 받을 수 있다. 반드시 API 경유.
    expect(e.romUrl).toBe('/api/games/retro/roms/653f1a2b3c4d5e6f70819202/file');
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
});
