// 코어 로그에서 "왜 안 떴는지" 만 추려 낸다 (#153).
//
// 배포되는 파일을 그대로 불러 검증한다 — player.js 가 import 하는 것과 같은 하나다.
import { describe, it, expect } from 'vitest';
import { pickLoadErrors } from '../../../public/games/retro/core-log.js';

// 실제로 받아 본 줄들. 손으로 지어내지 않는다 — 형식이 바뀌면 테스트가 알려 줘야 한다.
const REAL = [
  '[INFO] [Content]: Content loading skipped. Implementation will load it on its own.',
  '[libretro INFO] [FBNeo] Searching all possible locations for romset ddsoma',
  '[libretro INFO] [FBNeo] No romset found at /arc/ddsoma',
  '[libretro INFO] [FBNeo] Romset found at /ddsoma',
  '[libretro INFO] [FBNeo] Using ROM with known crc 0x5eb1991c and name dd2.05g from archive /ddsoma',
  '[libretro ERROR] [FBNeo] ROM at index 20 with name ddsoma.key and CRC 0x8c3cc560 is required',
  '[ERROR] [Content]: Failed to load content',
  '[INFO] [GL]: Version: OpenGL ES 2.0',
  "Translation not found for 'Exit Emulation'. Language set to 'en-US'",
];

describe('pickLoadErrors', () => {
  it('없다고 하는 파일을 집어낸다 — 이게 사용자가 알아야 할 전부다', () => {
    const out = pickLoadErrors(REAL);
    expect(out.missing).toEqual(['ddsoma.key']);
  });

  it('찾기 실패 자체도 알린다', () => {
    expect(pickLoadErrors(REAL).failed).toBe(true);
  });

  it('여러 개가 없으면 순서대로 모은다', () => {
    const out = pickLoadErrors([
      '[libretro ERROR] [FBNeo] ROM at index 0 with name dd2ud.03g and CRC 0x816f695a is required',
      '[libretro ERROR] [FBNeo] ROM at index 20 with name phoenix.key and CRC 0x2cf772b0 is required',
    ]);
    expect(out.missing).toEqual(['dd2ud.03g', 'phoenix.key']);
  });

  it('같은 파일이 두 번 나와도 한 번만 센다', () => {
    const line = '[libretro ERROR] [FBNeo] ROM at index 0 with name a.key and CRC 0x1 is required';
    expect(pickLoadErrors([line, line]).missing).toEqual(['a.key']);
  });

  // 검색 경로 나열이 수십 줄이라 그대로 보여 주면 정작 중요한 줄이 묻힌다.
  it('소음은 버린다 — 검색 경로·번역 경고·정상 적재', () => {
    const out = pickLoadErrors(REAL);
    expect(out.lines.join('\n')).not.toMatch(/No romset found|Translation not found|Using ROM with known/);
  });

  it('실제로 쓰인 아카이브는 남긴다 — patched 경로를 탔는지 보여 준다', () => {
    const out = pickLoadErrors([
      '[libretro WARN] [FBNeo] Using ROM with unknown crc 0xe89d22e3 and name dd2a.03g from archive //fbneo/patched/ddsoma',
    ]);
    expect(out.lines.join('\n')).toContain('fbneo/patched');
    expect(out.patched).toBe(true);
  });

  it('아무 문제가 없으면 조용하다', () => {
    const out = pickLoadErrors(['[INFO] [GL]: Version: OpenGL ES 2.0']);
    expect(out.failed).toBe(false);
    expect(out.missing).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('줄이 없어도 안전하다', () => {
    expect(() => pickLoadErrors([])).not.toThrow();
    expect(pickLoadErrors(undefined as unknown as string[]).failed).toBe(false);
  });

  // 화면에 붙일 것이라 무한정 늘어나면 안 된다.
  it('줄 수를 제한한다', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      `[libretro ERROR] [FBNeo] ROM at index ${i} with name f${i}.bin and CRC 0x1 is required`,
    );
    expect(pickLoadErrors(many).lines.length).toBeLessThanOrEqual(20);
  });
});
