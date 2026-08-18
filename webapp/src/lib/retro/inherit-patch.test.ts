// 같은 롬을 올렸을 때 물려줄 패치 고르기 (#190).
//
// 이 파일이 지키는 것은 하나다 — **모호하면 아무것도 하지 않는다.**
// 같은 롬에 한글 패치와 영어 패치가 각각 올라와 있을 수 있다. 아무거나 고르면 올린 사람이
// 원하지 않은 언어로 게임이 바뀌는데, 카드 체크박스는 "패치 켜짐/꺼짐"만 보여 주지 어느
// 패치인지까지 따지게 하지는 않는다. 그래서 갈리면 손을 뗀다.
import { describe, it, expect } from 'vitest';
import { pickInheritablePatch } from './inherit-patch';

const patch = (over: Record<string, unknown> = {}) => ({
  name: 'TOP_Korean.ips',
  format: 'ips',
  size: 1234,
  objectKey: 'retro-patches/uuid-TOP_Korean.ips',
  sha256: 'a'.repeat(64),
  ...over,
});

describe('pickInheritablePatch', () => {
  it('후보가 없으면 null', () => {
    expect(pickInheritablePatch([])).toBeNull();
  });

  it('하나면 그것을 물려준다', () => {
    const p = patch();
    expect(pickInheritablePatch([p])).toEqual(p);
  });

  it('여럿이어도 바이트가 같으면 물려준다 — 여러 사람이 같은 패치를 올린 흔한 경우', () => {
    const got = pickInheritablePatch([
      patch({ name: '한글패치.ips' }),
      patch({ name: 'TOP_Korean_RedWing.ips', objectKey: 'retro-patches/other.ips' }),
    ]);
    expect(got).not.toBeNull();
    expect(got!.sha256).toBe('a'.repeat(64));
  });

  // 이게 이 모듈의 존재 이유다.
  it('바이트가 다른 패치가 섞이면 null — 한글판과 영문판 중 아무거나 고르면 안 된다', () => {
    expect(pickInheritablePatch([
      patch({ name: '한글.ips', sha256: 'a'.repeat(64) }),
      patch({ name: 'english.ips', sha256: 'b'.repeat(64) }),
    ])).toBeNull();
  });

  it('해시를 모르는 후보는 없는 셈 친다 — 백필 전 문서다', () => {
    const good = patch();
    expect(pickInheritablePatch([patch({ sha256: '' }), good])).toEqual(good);
    expect(pickInheritablePatch([patch({ sha256: undefined })])).toBeNull();
  });

  it('해시가 sha256 모양이 아니면 버린다', () => {
    expect(pickInheritablePatch([patch({ sha256: 'not-a-hash' })])).toBeNull();
  });

  it('objectKey 가 없으면 복사할 대상이 없다 — 버린다', () => {
    expect(pickInheritablePatch([patch({ objectKey: '' })])).toBeNull();
  });

  it('버리고 남은 것이 모두 같은 해시면 물려준다', () => {
    const good = patch();
    expect(pickInheritablePatch([patch({ objectKey: '' }), patch({ sha256: '' }), good])).toEqual(good);
  });

  it('원본 배열을 건드리지 않는다', () => {
    const list = [patch(), patch({ sha256: 'b'.repeat(64) })];
    const copy = JSON.parse(JSON.stringify(list));
    pickInheritablePatch(list);
    expect(list).toEqual(copy);
  });
});
