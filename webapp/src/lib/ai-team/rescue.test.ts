// 막혔을 때 무엇을 남기나 (#282, #283).
//
// 파이프라인의 실패 쪽 분기는 **한 번도 실행된 적이 없었다.** 모순을 스펙에 심어 유도해도
// 클로드가 테스트 단계에서 흡수해 버려 닿지 못했다(#282). 닿지 못하는 이유는 그 분기들이
// 부수효과 한가운데 인라인으로 박혀 있어서다 — 판정을 꺼내면 여기서 직접 시험할 수 있다.
import { describe, it, expect } from 'vitest';
import {
  StuckKind, revertPlan, needsRebaseline, stuckTitle, stuckIssueBody, stuckComment,
  successComment,
} from '../../../../scripts/ai-team/rescue.mjs';

/** `snapshot()` 이 만드는 모양 — 경로 → 내용. */
const snap = (o: Record<string, string>) => new Map(Object.entries(o));

describe('revertPlan — 클로드가 만진 구현을 되돌린다', () => {
  it('새로 만든 것은 지우는 계획이다', () => {
    const plan = revertPlan(snap({}), snap({ 'webapp/src/a.ts': '새것' }));
    expect(plan).toEqual([{ path: 'webapp/src/a.ts', content: null }]);
  });

  it('고친 것은 원래 내용으로 되돌리는 계획이다', () => {
    const plan = revertPlan(snap({ 'webapp/src/a.ts': '원본' }), snap({ 'webapp/src/a.ts': '고침' }));
    expect(plan).toEqual([{ path: 'webapp/src/a.ts', content: '원본' }]);
  });

  it('안 건드린 것은 계획에 없다 — 멀쩡한 파일을 다시 쓰지 않는다', () => {
    expect(revertPlan(snap({ 'a.ts': '같음' }), snap({ 'a.ts': '같음' }))).toEqual([]);
  });

  // `changedBetween` 은 after 를 훑으므로 지워진 것을 못 본다. 되돌리기에서는 그게 구멍이다 —
  // 클로드가 구현을 지워 버리면 아무 계획도 안 나온다.
  it('지워진 것도 되살리는 계획을 낸다', () => {
    const plan = revertPlan(snap({ 'webapp/src/a.ts': '원본' }), snap({}));
    expect(plan).toEqual([{ path: 'webapp/src/a.ts', content: '원본' }]);
  });

  it('빈 파일로 만들어 놓은 것도 되돌린다 — 빈 문자열은 "안 바뀜" 이 아니다', () => {
    const plan = revertPlan(snap({ 'a.ts': '원본' }), snap({ 'a.ts': '' }));
    expect(plan).toEqual([{ path: 'a.ts', content: '원본' }]);
  });

  it('여러 건이면 경로 순으로 안정적으로 낸다 — 로그가 실행마다 달라지지 않게', () => {
    const plan = revertPlan(snap({ 'b.ts': '1' }), snap({ 'b.ts': '2', 'a.ts': '새것' }));
    expect(plan.map((p) => p.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('둘 다 비면 계획도 없다', () => {
    expect(revertPlan(snap({}), snap({}))).toEqual([]);
  });
});

describe('needsRebaseline — 클로드가 테스트를 고쳤나', () => {
  it('내용이 바뀌었으면 기준을 새로 잡는다', () => {
    expect(needsRebaseline(snap({ 'a.test.ts': '1' }), snap({ 'a.test.ts': '2' }))).toBe(true);
  });

  it('새 테스트가 생겨도 기준을 새로 잡는다', () => {
    expect(needsRebaseline(snap({}), snap({ 'a.test.ts': '1' }))).toBe(true);
  });

  it('테스트를 지웠어도 기준을 새로 잡는다', () => {
    expect(needsRebaseline(snap({ 'a.test.ts': '1' }), snap({}))).toBe(true);
  });

  // 이걸 놓치면 매 회차 "클로드가 테스트를 고쳤다" 로 잡혀 헛커밋이 쌓인다.
  it('그대로면 거짓이다', () => {
    expect(needsRebaseline(snap({ 'a.test.ts': '1' }), snap({ 'a.test.ts': '1' }))).toBe(false);
    expect(needsRebaseline(snap({}), snap({}))).toBe(false);
  });
});

describe('stuckTitle — 이슈 제목', () => {
  it('12회를 다 쓴 것과 에이전트가 죽은 것을 구분한다', () => {
    expect(stuckTitle(StuckKind.ROUNDS_EXHAUSTED, '# 바이트 크기 표기')).toContain('미완');
    expect(stuckTitle(StuckKind.AGENT_FAILED, '# 바이트 크기 표기')).toContain('중단');
  });

  it('스펙 첫 줄에서 머리말 기호를 턴다', () => {
    expect(stuckTitle(StuckKind.AGENT_FAILED, '#   바이트 크기 표기\n본문')).toContain('바이트 크기 표기');
    expect(stuckTitle(StuckKind.AGENT_FAILED, '# 제목')).not.toContain('#  ');
  });

  it('제목이 길면 자른다 — 깃허브 제목이 통째로 길어지지 않게', () => {
    const long = `# ${'가'.repeat(200)}`;
    expect(stuckTitle(StuckKind.AGENT_FAILED, long).length).toBeLessThanOrEqual(80);
  });

  it('스펙이 비어도 제목이 나온다', () => {
    expect(stuckTitle(StuckKind.AGENT_FAILED, '')).toBeTruthy();
  });
});

describe('stuckIssueBody — 이슈 본문', () => {
  /** 12회를 다 쓴 경우 — 잴 것이 다 있다. */
  const 소진 = {
    kind: StuckKind.ROUNDS_EXHAUSTED,
    spec: '# 바이트 크기 표기\n\n사람이 읽는 말로 바꾼다.',
    branch: 'pipeline/1787',
    worktree: '/tmp/ai-pipeline-1787',
    testFiles: ['webapp/src/lib/format-bytes.test.ts'],
    redCount: 61,
    round: 12,
    maxRounds: 12,
    verdict: 'FAILING',
    output: '✗ 1024 → 1 KB',
  };

  it('네 가지를 모두 담는다 — 목적·목표·진행·현재 상황', () => {
    const body = stuckIssueBody(소진);
    for (const h of ['## 목적', '## 목표', '## 진행', '## 현재 상황']) {
      expect(body).toContain(h);
    }
  });

  it('이어받을 수 있게 브랜치와 워크트리를 적는다', () => {
    const body = stuckIssueBody(소진);
    expect(body).toContain('pipeline/1787');
    expect(body).toContain('/tmp/ai-pipeline-1787');
  });

  it('몇 회차에서 어떤 판정으로 막혔는지 적는다', () => {
    const body = stuckIssueBody(소진);
    expect(body).toContain('12');
    expect(body).toContain('FAILING');
  });

  // #283 의 핵심 — 1회차에서 에이전트가 죽으면 red 도 테스트도 없다. 예전 코드는
  // `red.counts.numTotalTests` 를 그대로 읽어 여기서 다시 터졌다.
  it('에이전트가 죽어 잰 것이 하나도 없어도 본문이 나온다', () => {
    const body = stuckIssueBody({
      kind: StuckKind.AGENT_FAILED,
      spec: '# 바이트 크기 표기',
      branch: 'pipeline/1787',
      who: '코더',
      testFiles: [],
      redCount: null,
      round: 1,
      maxRounds: 12,
      verdict: null,
      output: 'Error: 404 model not found',
    });
    expect(body).toContain('코더');
    expect(body).toContain('404');
    expect(body).toContain('## 목적');
  });

  it('테스트가 아직 없으면 없다고 적는다 — 빈 목록을 그대로 흘리지 않는다', () => {
    const body = stuckIssueBody({ ...소진, testFiles: [], redCount: null });
    expect(body).toMatch(/아직 없습니다|없습니다/);
  });

  it('실패 출력이 길면 뒤쪽만 남긴다', () => {
    const body = stuckIssueBody({ ...소진, output: `${'앞'.repeat(5000)}꼬리표` });
    expect(body).toContain('꼬리표');
    expect(body.length).toBeLessThan(6000);
  });

  it('출력이 비어도 터지지 않는다', () => {
    expect(() => stuckIssueBody({ ...소진, output: '' })).not.toThrow();
  });

  it('스펙이 길면 앞쪽만 싣는다 — 이슈가 스펙 전문이 되지 않게', () => {
    const body = stuckIssueBody({ ...소진, spec: Array.from({ length: 80 }, (_, i) => `줄${i}`).join('\n') });
    expect(body).toContain('줄0');
    expect(body).not.toContain('줄79');
  });
});

describe('stuckComment — 스레드 덧글', () => {
  const 기본 = {
    kind: StuckKind.ROUNDS_EXHAUSTED,
    branch: 'pipeline/1787',
    round: 12,
    maxRounds: 12,
    verdict: 'FAILING',
    redCount: 61,
    testFiles: ['a.test.ts'],
    output: '✗ 실패했다',
  };

  it('무엇 때문에 멈췄는지 첫 줄에 적는다', () => {
    expect(stuckComment(기본).split('\n')[0]).toContain('12');
    expect(stuckComment({ ...기본, kind: StuckKind.AGENT_FAILED, who: '코더' }).split('\n')[0])
      .toContain('코더');
  });

  it('브랜치를 적는다 — 사람이 이어받을 자리다', () => {
    expect(stuckComment(기본)).toContain('pipeline/1787');
  });

  it('길면 자른다 — 덧글 5000자 상한에 걸리지 않게', () => {
    const c = stuckComment({ ...기본, output: '가'.repeat(20000) });
    expect(c.length).toBeLessThan(5000);
  });

  it('에이전트가 죽은 경우엔 회차 이야기를 하지 않는다 — 회차를 쓴 적이 없다', () => {
    const c = stuckComment({ ...기본, kind: StuckKind.AGENT_FAILED, who: '클로드', redCount: null });
    expect(c).toContain('클로드');
    expect(c).not.toContain('12회를 다');
  });
});

// 초록으로 끝났을 때도 스레드에 알린다 (#292).
//
// 야간 클로드는 이제 파이프라인을 직접 띄우지 않는다 — 요청만 남기고 러너가 그가 끝난 뒤에
// 돌린다. 그래서 **클로드는 결과를 못 본다.** 예전엔 "결과를 덧글에 남기세요" 라고 시켰는데,
// 기다리는 그 행동이 바로 파이프라인을 죽이던 것이었다. 이제 파이프라인이 직접 알린다.
describe('successComment — 초록으로 끝났을 때', () => {
  const 성공 = {
    branch: 'pipeline/1787',
    sha: 'abc1234',
    testFiles: ['webapp/src/lib/format-bytes.test.ts'],
    redCount: 61,
    round: 2,
    wholeCount: 2712,
  };

  it('이어받을 브랜치와 커밋을 적는다', () => {
    const c = successComment(성공);
    expect(c).toContain('pipeline/1787');
    expect(c).toContain('abc1234');
  });

  it('무엇을 근거로 초록이라 하는지 적는다 — 빨강 건수·회차·전체 스위트', () => {
    const c = successComment(성공);
    expect(c).toContain('61');
    expect(c).toContain('2712');
    expect(c).toContain('2회차');
  });

  it('머지는 사람 몫이라고 적는다 — 파이프라인은 PR·머지를 하지 않는다', () => {
    expect(successComment(성공)).toMatch(/머지|검수/);
  });

  it('전체 스위트 수를 모를 때도 터지지 않는다', () => {
    expect(() => successComment({ ...성공, wholeCount: null })).not.toThrow();
  });

  it('테스트 파일이 여러 건이면 다 적는다', () => {
    const c = successComment({ ...성공, testFiles: ['a.test.ts', 'b.test.ts'] });
    expect(c).toContain('a.test.ts');
    expect(c).toContain('b.test.ts');
  });

  it('덧글 상한 아래로 유지한다', () => {
    const many = Array.from({ length: 200 }, (_, i) => `webapp/src/lib/아주긴이름${i}.test.ts`);
    expect(successComment({ ...성공, testFiles: many }).length).toBeLessThan(5000);
  });
});

// 게이트 실패도 흔적을 남긴다 (#312).
//
// 2026-08-28 21:37 실행이 `빨강 게이트 실패(UNEXPECTED_PASS)` 로 끝났는데 die() 라서
// 브랜치도 이슈도 덧글도 안 남았다. 야간 클로드는 그것을 보고 SIGKILL 로 오진했고,
// 자기가 이미 시도한 줄 몰라 **다음 시간에 같은 스펙을 또 요청했다.** 흔적이 없으면
// 같은 실패를 무한히 반복한다.
describe('게이트 실패 (#312)', () => {
  const 게이트 = {
    kind: StuckKind.GATE_FAILED,
    gate: '빨강',
    verdict: 'UNEXPECTED_PASS',
    spec: '# 서버 상태 메뉴',
    branch: 'pipeline/1787',
    testFiles: ['webapp/src/components/navbar.test.tsx'],
    output: '2 passed',
  };

  it('제목이 다른 두 경우와 구분된다', () => {
    const t = stuckTitle(StuckKind.GATE_FAILED, '# 제목');
    expect(t).not.toContain('미완');
    expect(t).not.toContain('중단');
  });

  it('어느 문에서 어떤 판정으로 걸렸는지 본문에 적는다', () => {
    const b = stuckIssueBody(게이트);
    expect(b).toContain('빨강');
    expect(b).toContain('UNEXPECTED_PASS');
  });

  // 이게 재시도 고리를 끊는 부분이다 — 무엇을 고쳐야 하는지 없으면 또 같은 걸 요청한다.
  it('UNEXPECTED_PASS 는 무슨 뜻인지 풀어 준다', () => {
    const b = stuckIssueBody(게이트);
    expect(b).toMatch(/구현 없이|아무것도 안 잡/);
  });

  it('덧글 첫 줄에 게이트 실패임이 드러난다', () => {
    const c = stuckComment(게이트);
    expect(c.split('\n')[0]).toMatch(/게이트/);
    expect(c).toContain('UNEXPECTED_PASS');
  });

  it('전체 스위트 실패도 같은 틀로 담긴다', () => {
    const c = stuckComment({ ...게이트, gate: '전체', verdict: 'FAILING' });
    expect(c).toContain('전체');
    expect(c).toContain('FAILING');
  });

  it('브랜치를 못 올렸어도 터지지 않는다', () => {
    expect(() => stuckIssueBody({ ...게이트, branch: null })).not.toThrow();
    expect(() => stuckComment({ ...게이트, branch: null })).not.toThrow();
  });
});
