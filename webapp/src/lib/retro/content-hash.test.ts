// netplay 방을 가르는 콘텐츠 키 (#188).
//
// netplay 는 **락스텝 입력 동기화**다 — "20프레임 뒤에 A 버튼"을 보내면 양쪽이 각자
// 에뮬레이터로 같은 계산을 돌려 같은 결과에 도달한다는 전제로 굴러간다. 그 전제는 두 롬의
// **바이트가 완전히 같을 때만** 성립한다.
//
// 그런데 EmulatorJS 는 롬 일치를 전혀 검사하지 않는다(실측: checksum·crc·romHash 0건).
// `game_id` 만 같으면 서로 다른 롬으로도 방에 붙고, 그 뒤로 조용히 desync 난다 — 화면이
// 서로 달라지는데 아무 오류도 안 뜬다.
//
// 그래서 이 키가 안전장치다. **코어가 실제로 읽는 바이트**가 다르면 키가 갈리고, 갈리면
// 애초에 만나지 않는다. 만나서 어긋나느니 안 만나는 게 낫다.
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

  // 이 파일의 존재 이유.
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

  // 백필 전 문서가 있다. 근거 없이 방을 만들면 엉뚱한 상대와 붙는다.
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
    // 두 사용자가 각자 올린 같은 롬: 문서 id 는 다르지만 해시는 같다.
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
