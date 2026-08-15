// 예전 이름으로 남은 게임 세이브(SRAM) 되살리기 (#175).
//
// #137 이전에는 롬 주소가 전부 `/api/games/retro/roms/<id>/file` 로 끝났다. EmulatorJS 는
// 주소의 **마지막 조각**으로 코어에 줄 파일명을 정하고, 코어는 그 이름으로 배터리 세이브를
// 남긴다 — 그래서 그 시절 세이브는 전부 `/data/saves/<코어>/file.srm` 한 곳에 쌓였다.
//
// #137 이 주소를 `.../file/<id>.sfc` 로 바꾸면서 코어가 찾는 이름이 `<id>.srm` 이 됐다.
// 파일은 브라우저(IndexedDB)에 그대로 있는데 이름이 어긋나 게임이 「저장된 데이터 없음」을
// 띄운다. 실제로 재현했다:
//   옛 주소 → /data/saves/Snes9x/file.srm 생성
//   새 주소 → /data/saves/Snes9x/top.srm 을 찾음(없음). file.srm 은 그대로 남아 있음.
//
// 되살리는 규칙은 **복사**다. 원본 `file.srm` 은 손대지 않는다 — 잘못 짚었을 때 되돌릴 자리가
// 남아야 한다.
import { describe, it, expect } from 'vitest';
import {
  baseFromGameUrl,
  planLegacySaveRestore,
} from '../../../public/games/retro/legacy-save.js';

describe('baseFromGameUrl', () => {
  // saveDatabaseLoaded 시점엔 emulator.fileName 이 아직 없다(실측). config.gameUrl 만 있어서
  // EmulatorJS 와 같은 방식으로 우리가 직접 이름을 뽑는다.
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

  // 이 게임 이름으로 이미 저장한 게 있으면 그게 최신이다. 덮어쓰면 진짜로 잃는다.
  it('이미 이 게임 세이브가 있으면 아무것도 하지 않는다', () => {
    expect(
      planLegacySaveRestore({ entries: ['file.srm', `${target}.srm`], targetBase: target }),
    ).toEqual([]);
  });

  it('옛 세이브가 없으면 아무것도 하지 않는다', () => {
    expect(planLegacySaveRestore({ entries: ['top.srm'], targetBase: target })).toEqual([]);
    expect(planLegacySaveRestore({ entries: [], targetBase: target })).toEqual([]);
  });

  // 주소가 아직 옛 모양이면 원본과 대상이 같다 — 자기 자신을 덮어쓸 뻔한다.
  it('대상 이름이 file 이면 하지 않는다', () => {
    expect(planLegacySaveRestore({ entries: ['file.srm'], targetBase: 'file' })).toEqual([]);
  });

  it('대상 이름이 비면 하지 않는다', () => {
    expect(planLegacySaveRestore({ entries: ['file.srm'], targetBase: '' })).toEqual([]);
  });

  // 코어에 따라 .srm 말고 다른 것도 남는다(예: .rtc — 시계 달린 카트리지).
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

  // 이름이 비슷할 뿐인 남의 파일을 끌어오면 안 된다.
  it('filesystem.srm 같은 이름은 짝이 아니다', () => {
    expect(planLegacySaveRestore({ entries: ['filesystem.srm'], targetBase: target })).toEqual([]);
  });

  it('이 게임의 다른 확장자 세이브가 하나라도 있으면 손대지 않는다', () => {
    expect(
      planLegacySaveRestore({ entries: ['file.srm', `${target}.rtc`], targetBase: target }),
    ).toEqual([]);
  });
});
