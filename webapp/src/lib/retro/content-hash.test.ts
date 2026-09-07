// The content key that separates netplay rooms (#188).
//
// netplay is **lockstep input synchronisation** - sending "the A button 20 frames from now" works on the premise that
// both sides run the same computation in their own emulator and reach the same result. That premise holds **only when
// the two ROMs are byte-for-byte identical**.
//
// But EmulatorJS never checks ROM equality (measured: zero occurrences of checksum, crc or romHash).
// A matching `game_id` alone joins a room even with different ROMs, and it desyncs quietly from there - the screens
// diverge with no error at all.
//
// So this key is the safeguard. If **the bytes the core actually reads** differ, the keys differ, and different keys
// never meet in the first place. Not meeting beats meeting and diverging.
import { describe, it, expect } from 'vitest';
import { contentKeyOf } from './content-hash';
import { gameNumberOf } from './game-number';

const ROM = 'a'.repeat(64);
const PATCH = 'b'.repeat(64);
const P1 = 'c'.repeat(64);
const P2 = 'd'.repeat(64);

describe('contentKeyOf', () => {
  it('같은 롬·같은 패치면 같은 키 — 다른 계정이라도 같은 방이 된다', () => {
    const a = contentKeyOf({ romHash: ROM, patchHash: PATCH });
    const b = contentKeyOf({ romHash: ROM, patchHash: PATCH });
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });

  // The reason this file exists.
  it('패치를 켠 쪽과 끈 쪽은 키가 다르다 — desync 를 만들 기회 자체를 없앤다', () => {
    expect(contentKeyOf({ romHash: ROM, patchHash: PATCH }))
      .not.toBe(contentKeyOf({ romHash: ROM }));
  });

  it('패치가 다르면 키도 다르다', () => {
    expect(contentKeyOf({ romHash: ROM, patchHash: PATCH }))
      .not.toBe(contentKeyOf({ romHash: ROM, patchHash: 'e'.repeat(64) }));
  });

  it('롬이 다르면 키도 다르다 — 리전·리비전 차이도 걸러진다', () => {
    expect(contentKeyOf({ romHash: ROM })).not.toBe(contentKeyOf({ romHash: 'f'.repeat(64) }));
  });

  it('부모셋도 코어가 읽는 바이트라 키에 들어간다', () => {
    expect(contentKeyOf({ romHash: ROM, parentHashes: [P1] }))
      .not.toBe(contentKeyOf({ romHash: ROM }));
  });

  it('부모셋 순서가 달라도 같은 키 — 올린 순서까지 맞출 이유는 없다', () => {
    expect(contentKeyOf({ romHash: ROM, parentHashes: [P1, P2] }))
      .toBe(contentKeyOf({ romHash: ROM, parentHashes: [P2, P1] }));
  });

  // There are documents from before the backfill. Making a room without grounds pairs you with the wrong partner.
  it('롬 해시가 없으면 null — 호출측이 netplay 진입을 감춘다', () => {
    expect(contentKeyOf({ romHash: '' })).toBeNull();
    expect(contentKeyOf({ romHash: undefined })).toBeNull();
  });

  it('부모셋 해시가 하나라도 비면 null — 절반만 아는 상태로 방을 열지 않는다', () => {
    expect(contentKeyOf({ romHash: ROM, parentHashes: [P1, ''] })).toBeNull();
  });

  it('패치가 있는데 해시를 모르면 null', () => {
    expect(contentKeyOf({ romHash: ROM, patchHash: '' , hasPatch: true })).toBeNull();
  });
});

describe('실제 쓰임 — 방 번호까지', () => {
  it('서로 다른 계정의 서로 다른 문서라도 바이트가 같으면 같은 방 번호', () => {
    // The same ROM uploaded by two users: different document ids, the same hash.
    const 사용자A = contentKeyOf({ romHash: ROM, patchHash: PATCH })!;
    const 사용자B = contentKeyOf({ romHash: ROM, patchHash: PATCH })!;
    expect(gameNumberOf(사용자A)).toBe(gameNumberOf(사용자B));
  });

  it('한쪽만 패치를 켜면 방 번호가 갈린다', () => {
    const 패치켬 = contentKeyOf({ romHash: ROM, patchHash: PATCH })!;
    const 패치끔 = contentKeyOf({ romHash: ROM })!;
    expect(gameNumberOf(패치켬)).not.toBe(gameNumberOf(패치끔));
  });
});
