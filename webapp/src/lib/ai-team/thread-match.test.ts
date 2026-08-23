// AI 팀 요청 스레드 판정 (#207).
//
// 이 판정이 AI 둘에게 열어 주는 문의 **유일한 잠금장치**다. 키만 맞으면 아무 글에나 쓸 수
// 있게 되면 안 되므로, 세 조건이 **모두** 맞을 때만 통과한다.
import { describe, it, expect } from 'vitest';
import { AI_DONE_TAG, AI_TEAM_TAG, aiTeamPostFilter, isAiTeamPost } from './thread-match';

const owner = 'owner@x.test';
const other = 'you@x.test';

/** 정상 요청 글 — 여기서 한 조건씩 무너뜨려 본다. */
function requestPost(over: Record<string, unknown> = {}) {
  return {
    userEmail: owner,
    isPrivate: true,
    isDeleted: false,
    tags: ['ai-req', '잡담'],
    ...over,
  };
}

describe('isAiTeamPost', () => {
  it('주인의 비공개 + ai-req 태그 글만 통과', () => {
    expect(isAiTeamPost(requestPost(), owner)).toBe(true);
  });

  it('공개 글은 거부 — 아무나 요청을 심을 수 있으면 안 된다', () => {
    expect(isAiTeamPost(requestPost({ isPrivate: false }), owner)).toBe(false);
    expect(isAiTeamPost(requestPost({ isPrivate: undefined }), owner)).toBe(false);
  });

  it('남의 글은 거부 — 태그와 비공개가 맞아도', () => {
    expect(isAiTeamPost(requestPost({ userEmail: other }), owner)).toBe(false);
  });

  it('ai-req 태그가 없으면 거부 — 주인의 다른 비공개 글을 건드리지 않는다', () => {
    expect(isAiTeamPost(requestPost({ tags: ['일기'] }), owner)).toBe(false);
    expect(isAiTeamPost(requestPost({ tags: [] }), owner)).toBe(false);
    expect(isAiTeamPost(requestPost({ tags: undefined }), owner)).toBe(false);
  });

  it('삭제된 글은 거부', () => {
    expect(isAiTeamPost(requestPost({ isDeleted: true }), owner)).toBe(false);
  });

  // 완료 표시가 없으면 한 번 요청한 글이 영원히 목록에 남는다 (#213).
  it('ai-done 이 붙으면 거부 — 끝난 요청을 다시 열지 않는다', () => {
    expect(isAiTeamPost(requestPost({ tags: ['ai-req', 'ai-done'] }), owner)).toBe(false);
    expect(isAiTeamPost(requestPost({ tags: ['ai-req', 'AI-DONE'] }), owner)).toBe(false);
    expect(isAiTeamPost(requestPost({ tags: ['ai-req', ' ai-done '] }), owner)).toBe(false);
  });

  it('ai-done 만 있고 ai-req 가 없으면 당연히 거부', () => {
    expect(isAiTeamPost(requestPost({ tags: ['ai-done'] }), owner)).toBe(false);
  });

  // 태그를 떼는 게 아니라 더하는 방식이라, 되돌리기는 ai-done 만 빼면 된다.
  it('ai-done 을 떼면 다시 열린다', () => {
    expect(isAiTeamPost(requestPost({ tags: ['ai-req'] }), owner)).toBe(true);
  });

  it('태그 대소문자·공백은 무시', () => {
    expect(isAiTeamPost(requestPost({ tags: ['AI-REQ'] }), owner)).toBe(true);
    expect(isAiTeamPost(requestPost({ tags: [' ai-req '] }), owner)).toBe(true);
  });

  it('글이 없으면 거부', () => {
    expect(isAiTeamPost(null, owner)).toBe(false);
    expect(isAiTeamPost(undefined, owner)).toBe(false);
  });

  // OWNER_EMAIL 이 비어 있는 배포에서 userEmail 이 빈 문서와 맞아떨어지면 문이 활짝 열린다.
  it('주인 이메일이 비어 있으면 무조건 거부', () => {
    expect(isAiTeamPost(requestPost({ userEmail: '' }), '')).toBe(false);
    expect(isAiTeamPost(requestPost(), '')).toBe(false);
    expect(isAiTeamPost(requestPost(), undefined)).toBe(false);
  });
});

describe('aiTeamPostFilter', () => {
  /** 태그 조건 두 개는 `$and` 안에 들어간다 — 한 키(`tags`)에 두 조건을 걸어야 해서. */
  function tagConds(email = owner) {
    return (aiTeamPostFilter(email) as { $and: Array<Record<string, unknown>> }).$and;
  }

  it('네 조건을 모두 담는다 — 주인·비공개·미삭제·태그', () => {
    const f = aiTeamPostFilter(owner) as Record<string, unknown>;
    expect(f.userEmail).toBe(owner);
    expect(f.isPrivate).toBe(true);
    expect(f.isDeleted).toEqual({ $ne: true });
    expect(f.$and).toHaveLength(2);
  });

  it('ai-req 는 있어야 하고 ai-done 은 없어야 한다', () => {
    const [need, exclude] = tagConds();
    expect(need.tags).toBeInstanceOf(RegExp);
    expect(String(need.tags)).toContain(AI_TEAM_TAG);

    const not = (exclude.tags as { $not: RegExp }).$not;
    expect(not).toBeInstanceOf(RegExp);
    expect(String(not)).toContain(AI_DONE_TAG);
  });

  it('태그 정규식은 정확히 일치만 — ai-req-2 같은 글에 걸리지 않는다', () => {
    const need = tagConds()[0].tags as RegExp;
    expect(need.test('ai-req')).toBe(true);
    expect(need.test('AI-REQ')).toBe(true);
    expect(need.test('ai-req-2')).toBe(false);
    expect(need.test('xai-req')).toBe(false);
  });

  it('완료 태그 정규식도 정확히 일치만 — ai-done-2 를 완료로 보지 않는다', () => {
    const not = (tagConds()[1].tags as { $not: RegExp }).$not;
    expect(not.test('ai-done')).toBe(true);
    expect(not.test('AI-DONE')).toBe(true);
    expect(not.test('ai-done-2')).toBe(false);
  });

  it('주인 이메일이 비면 던진다 — 빈 필터로 조회되는 사고를 막는다', () => {
    expect(() => aiTeamPostFilter('')).toThrow();
  });
});
