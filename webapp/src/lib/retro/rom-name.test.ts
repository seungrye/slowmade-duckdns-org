// 병합·패치를 거친 롬을 코어에 넘길 때 쓸 파일명 (#148).
//
// 배포되는 파일을 그대로 불러 검증한다 — player.js 가 import 하는 것과 같은 하나다.
import { describe, it, expect } from 'vitest';
import { romFileNameFromUrl } from '../../../public/games/retro/rom-name.js';

describe('romFileNameFromUrl', () => {
  // #148 의 핵심 — 아케이드는 **파일명이 곧 롬셋 이름**이다. 여기가 틀어지면 코어가 롬을
  // 못 찾아 게임 대신 설정 화면이 뜬다.
  it('아케이드: 주소의 마지막 조각을 그대로 살린다', () => {
    expect(romFileNameFromUrl('/api/games/retro/roms/abc123/file/ddsoma.zip', 'zip')).toBe(
      'ddsoma.zip',
    );
  });

  it('SNES: 캐시 키용으로 붙인 id 이름도 그대로 쓴다', () => {
    expect(romFileNameFromUrl('/api/games/retro/roms/abc123/file/abc123.sfc', 'sfc')).toBe(
      'abc123.sfc',
    );
  });

  it('기본 제공 롬의 정적 경로도 다룬다', () => {
    expect(romFileNameFromUrl('/games/retro/roms/superbossgaiden.sfc', 'sfc')).toBe(
      'superbossgaiden.sfc',
    );
  });

  it('쿼리와 프래그먼트는 떼어 낸다', () => {
    expect(romFileNameFromUrl('/x/ddsoma.zip?v=2', 'zip')).toBe('ddsoma.zip');
    expect(romFileNameFromUrl('/x/ddsoma.zip#frag', 'zip')).toBe('ddsoma.zip');
  });

  it('퍼센트 인코딩을 푼다 — 주소에는 인코딩된 이름이 실린다', () => {
    expect(romFileNameFromUrl('/x/Super%20Mario%20World.sfc', 'sfc')).toBe(
      'Super Mario World.sfc',
    );
  });

  it('확장자가 없으면 코어에 맞는 것을 붙인다', () => {
    expect(romFileNameFromUrl('/api/games/retro/roms/abc/file/abc', 'sfc')).toBe('abc.sfc');
  });

  it('이름을 못 뽑으면 안전한 기본값', () => {
    expect(romFileNameFromUrl('', 'zip')).toBe('game.zip');
    expect(romFileNameFromUrl('/x/', 'zip')).toBe('game.zip');
    // 타입상 올 수 없지만 런타임에선 온다 — 주소 조립이 어긋나면 undefined 가 흘러든다.
    expect(romFileNameFromUrl(null as unknown as string, 'bin')).toBe('game.bin');
  });

  // 이 이름은 그대로 에뮬레이터 가상 파일시스템의 writeFile 경로가 된다.
  it('경로 구분자는 남기지 않는다 — 파일시스템을 벗어나지 못하게', () => {
    const out = romFileNameFromUrl('/x/%2E%2E%2Fevil.zip', 'zip');
    expect(out).not.toContain('/');
    expect(out).not.toContain('\\');
  });

  it('망가진 퍼센트 이스케이프에도 던지지 않는다', () => {
    expect(() => romFileNameFromUrl('/x/%E0%A4%A.zip', 'zip')).not.toThrow();
    expect(romFileNameFromUrl('/x/%E0%A4%A.zip', 'zip')).toBeTruthy();
  });
});
