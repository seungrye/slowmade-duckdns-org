// Restoring game saves (SRAM) left under the old name (#175).
//
// Before #137 every ROM address ended in `/api/games/retro/roms/<id>/file`. EmulatorJS decides the filename it gives
// the core from **the last segment** of the address, and the core writes its battery save under that name - so every
// save from that era piled up in one place, `/data/saves/<core>/file.srm`.
//
// #137 changed the address to `.../file/<id>.sfc`, making the name the core looks for `<id>.srm`.
// The file is still there in the browser (IndexedDB) while the name no longer matches, so the game shows "no saved
// data". It was reproduced:
//   the old address -> created /data/saves/Snes9x/file.srm
//   the new address -> looks for /data/saves/Snes9x/top.srm (absent). file.srm is still sitting there.
//
// The restore rule is **copy**. The original `file.srm` is untouched - there has to be somewhere to go back to when
// the guess is wrong.
import { describe, it, expect } from 'vitest';
import {
  baseFromGameUrl,
  planLegacySaveRestore,
} from '../../../public/games/retro/legacy-save.js';

describe('baseFromGameUrl', () => {
  // At saveDatabaseLoaded, emulator.fileName does not exist yet (measured). Only config.gameUrl is there, so the name
  // is derived the same way EmulatorJS does.
  it('주소 마지막 조각에서 확장자를 뗀다', () => {
    expect(baseFromGameUrl('/api/games/retro/roms/6a7c88d9/file/6a7c88d9.sfc')).toBe('6a7c88d9');
    expect(baseFromGameUrl('/games/retro/roms/top.sfc')).toBe('top');
  });

  it('#137 이전 주소는 그대로 file — 이게 옛 세이브의 이름이다', () => {
    expect(baseFromGameUrl('/api/games/retro/roms/6a7c88d9/file')).toBe('file');
  });

  it('퍼센트 인코딩을 푼다 — 한글·공백 파일명', () => {
    expect(baseFromGameUrl('/api/x/file/%ED%85%8C%EC%9D%BC%EC%A6%88%20A.sfc')).toBe('테일즈 A');
  });

  it('질의문자열과 앵커는 이름이 아니다', () => {
    expect(baseFromGameUrl('/api/x/file/a.sfc?v=2#frag')).toBe('a');
  });

  it('점이 여러 개면 마지막 것만 확장자', () => {
    expect(baseFromGameUrl('/api/x/file/Tales of Phantasia (Japan).sfc')).toBe(
      'Tales of Phantasia (Japan)',
    );
  });

  it('알 수 없는 주소는 빈 문자열 — 호출측이 건너뛴다', () => {
    expect(baseFromGameUrl('')).toBe('');
    expect(baseFromGameUrl(null)).toBe('');
    expect(baseFromGameUrl('blob:https://x/abc')).toBe('');
  });
});

describe('planLegacySaveRestore', () => {
  const target = '6a7c88d9b25ae2b9a7972b8e';

  it('옛 이름의 세이브를 이 게임 이름으로 복사한다', () => {
    expect(planLegacySaveRestore({ entries: ['file.srm'], targetBase: target })).toEqual([
      { from: 'file.srm', to: `${target}.srm` },
    ]);
  });

  // If something is already saved under this game's name, that is the newer one. Overwriting really loses it.
  it('이미 이 게임 세이브가 있으면 아무것도 하지 않는다', () => {
    expect(
      planLegacySaveRestore({ entries: ['file.srm', `${target}.srm`], targetBase: target }),
    ).toEqual([]);
  });

  it('옛 세이브가 없으면 아무것도 하지 않는다', () => {
    expect(planLegacySaveRestore({ entries: ['top.srm'], targetBase: target })).toEqual([]);
    expect(planLegacySaveRestore({ entries: [], targetBase: target })).toEqual([]);
  });

  // If the address is still the old shape, the source and target are the same - it would nearly overwrite itself.
  it('대상 이름이 file 이면 하지 않는다', () => {
    expect(planLegacySaveRestore({ entries: ['file.srm'], targetBase: 'file' })).toEqual([]);
  });

  it('대상 이름이 비면 하지 않는다', () => {
    expect(planLegacySaveRestore({ entries: ['file.srm'], targetBase: '' })).toEqual([]);
  });

  // Depending on the core, things other than .srm are left too (.rtc, say - a cartridge with a clock).
  it('file. 로 시작하는 짝들을 모두 옮긴다', () => {
    expect(
      planLegacySaveRestore({ entries: ['file.srm', 'file.rtc', 'other.srm'], targetBase: target }),
    ).toEqual([
      { from: 'file.srm', to: `${target}.srm` },
      { from: 'file.rtc', to: `${target}.rtc` },
    ]);
  });

  it('확장자 없는 file 도 짝이다', () => {
    expect(planLegacySaveRestore({ entries: ['file'], targetBase: target })).toEqual([
      { from: 'file', to: target },
    ]);
  });

  // Someone else's file that merely has a similar name must not be pulled in.
  it('filesystem.srm 같은 이름은 짝이 아니다', () => {
    expect(planLegacySaveRestore({ entries: ['filesystem.srm'], targetBase: target })).toEqual([]);
  });

  it('이 게임의 다른 확장자 세이브가 하나라도 있으면 손대지 않는다', () => {
    expect(
      planLegacySaveRestore({ entries: ['file.srm', `${target}.rtc`], targetBase: target }),
    ).toEqual([]);
  });
});
