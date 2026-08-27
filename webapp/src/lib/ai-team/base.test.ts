// 파이프라인 워크트리 기준 (#284).
//
// `pipeline.mjs` 가 워크트리를 만들 때 `main` 이 하드코딩돼 있었다. 그래서 어느 브랜치에서
// 돌려도 워크트리 내용이 main 이고, **그 브랜치가 새로 넣은 테스트가 워크트리에 없다** —
// 파이프라인이 자기 자신을 검증하지 못한다. 실제로 `feat/279-runner-pipeline` 에서
// 돌렸을 때 그 브랜치의 `snapshot.test.ts`(66줄)가 전체 스위트에 안 들어갔다.
import { describe, it, expect } from 'vitest';
import { resolveBase } from '../../../../scripts/ai-team/base.mjs';

describe('resolveBase — 워크트리를 어디서 갈라내나', () => {
  it('아무것도 없으면 지금 HEAD 에서 갈라낸다', () => {
    expect(resolveBase({ headRef: 'feat/279-runner-pipeline' })).toBe('feat/279-runner-pipeline');
  });

  it('PIPELINE_BASE 가 있으면 그것이 이긴다 — 러너가 main 을 못박을 수 있어야 한다', () => {
    expect(resolveBase({ envBase: 'main', headRef: 'feat/279-runner-pipeline' })).toBe('main');
  });

  it('공백뿐인 env 는 없는 것으로 본다', () => {
    expect(resolveBase({ envBase: '   ', headRef: 'develop' })).toBe('develop');
  });

  it('env 값의 앞뒤 공백은 턴다 — 브랜치명에 개행이 붙으면 git 이 못 찾는다', () => {
    expect(resolveBase({ envBase: ' main\n', headRef: 'x' })).toBe('main');
  });

  // detached HEAD 에서는 `rev-parse --abbrev-ref HEAD` 가 'HEAD' 를 준다. 그걸 그대로
  // 넘기면 워크트리를 못 만든다.
  it('detached HEAD 면 main 으로 떨어진다', () => {
    expect(resolveBase({ headRef: 'HEAD' })).toBe('main');
  });

  it('HEAD 를 아예 못 읽어도 main 으로 떨어진다', () => {
    expect(resolveBase({})).toBe('main');
    expect(resolveBase({ headRef: '' })).toBe('main');
  });
});
