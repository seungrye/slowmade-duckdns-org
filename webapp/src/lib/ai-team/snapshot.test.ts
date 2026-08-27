// 누가 무엇을 고쳤는지 가리는 규칙 (#279).
//
// 파이프라인에는 두 방향의 금지가 있다 — **코더는 테스트를 못 만지고, 클로드는 구현을 못
// 만진다.** 앞쪽은 기계로 막고 있었는데 뒤쪽은 프롬프트로만 막고 있었다. 이 세션에서
// "프롬프트로 막았다" 가 세 번 깨졌으므로 둘 다 기계로 막는다.
//
// 처음엔 **파일 이름만** 비교했다. 그러면 **기존 파일을 고친 것을 놓친다** — 새로 만든 것만
// 잡히고 내용이 바뀐 것은 그대로 지나간다. 그래서 내용으로 비교한다.
import { describe, it, expect } from 'vitest';
import { changedBetween, isImpl, isTest } from '../../../../scripts/ai-team/snapshot.mjs';

const 스냅 = (o: Record<string, string>) => new Map(Object.entries(o));

describe('changedBetween — 무엇이 바뀌었나', () => {
  it('아무것도 안 바뀌면 빈 목록', () => {
    const s = 스냅({ 'a.ts': '내용' });
    expect(changedBetween(s, 스냅({ 'a.ts': '내용' }))).toEqual([]);
  });

  // 이게 이름 비교로는 안 잡히던 것이다.
  it('기존 파일의 내용이 바뀌면 잡는다', () => {
    expect(changedBetween(스냅({ 'a.ts': '전' }), 스냅({ 'a.ts': '후' }))).toEqual(['a.ts']);
  });

  it('새로 생긴 파일을 잡는다', () => {
    expect(changedBetween(스냅({}), 스냅({ 'b.ts': '새것' }))).toEqual(['b.ts']);
  });

  it('여러 개가 바뀌면 다 잡는다', () => {
    const got = changedBetween(스냅({ 'a.ts': '전' }), 스냅({ 'a.ts': '후', 'b.ts': '새것' }));
    expect(got.sort()).toEqual(['a.ts', 'b.ts']);
  });

  // 지워진 것은 여기서 안 잡는다 — 되돌릴 때 원본이 남아 있으므로 문제가 되지 않는다.
  it('지워진 것은 세지 않는다', () => {
    expect(changedBetween(스냅({ 'a.ts': '내용' }), 스냅({}))).toEqual([]);
  });

  it('빈 내용도 내용으로 친다', () => {
    expect(changedBetween(스냅({ 'a.ts': '' }), 스냅({ 'a.ts': 'x' }))).toEqual(['a.ts']);
  });
});

describe('isTest / isImpl — 누구 몫인 파일인가', () => {
  it('테스트를 가린다', () => {
    expect(isTest('webapp/src/lib/a.test.ts')).toBe(true);
    expect(isTest('webapp/src/ui/b.test.tsx')).toBe(true);
    expect(isTest('webapp/src/lib/a.ts')).toBe(false);
  });

  it('구현은 webapp 안의 테스트 아닌 것', () => {
    expect(isImpl('webapp/src/lib/a.ts')).toBe(true);
    expect(isImpl('webapp/src/lib/a.test.ts')).toBe(false);
  });

  // 스펙 파일이 구현으로 잡히면 클로드가 스펙을 남길 때마다 되돌아간다.
  it('webapp 밖은 구현이 아니다', () => {
    expect(isImpl('docs/spec/x.md')).toBe(false);
    expect(isImpl('scripts/ai-team/pipeline.mjs')).toBe(false);
  });

  it('이름에 test 가 들어가도 확장자가 아니면 테스트가 아니다', () => {
    expect(isTest('webapp/src/lib/test-helper.ts')).toBe(false);
    expect(isImpl('webapp/src/lib/test-helper.ts')).toBe(true);
  });
});
