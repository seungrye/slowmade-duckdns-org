// 모델 순위 측정 결과를 순위로 (#305).
//
// 오늘 후보 5개를 재서 셋이 실패했는데, 원인이 능력이 아니라 **무료 일일 한도 소진**이었다.
// 그대로 반영했으면 멀쩡한 모델 셋이 영구 강등됐다. 그래서 **못 잰 것(skip)과 못 하는
// 것(fail)을 반드시 구분**한다.
import { describe, it, expect } from 'vitest';
import { rankResults, readRanking, RANKING_MAX_AGE_SEC } from '../../../../scripts/ai-team/ranking.mjs';

describe('rankResults — 잰 것으로 순위를 만든다', () => {
  it('통과한 것이 앞, 빠른 순', () => {
    const r = rankResults({ results: [
      { id: 'b', status: 'pass', seconds: 30 },
      { id: 'a', status: 'pass', seconds: 10 },
    ] });
    expect(r).toEqual(['a', 'b']);
  });

  it('돌았는데 실패한 것은 맨 뒤', () => {
    const r = rankResults({ results: [
      { id: 'x', status: 'fail', seconds: 5 },
      { id: 'a', status: 'pass', seconds: 30 },
    ] });
    expect(r).toEqual(['a', 'x']);
  });

  // 이게 이 모듈을 만든 이유다.
  it('한도로 못 잰 것은 실패보다 앞이다 — 강등되지 않는다', () => {
    const r = rankResults({ results: [
      { id: 'bad', status: 'fail', seconds: 5 },
      { id: 'unknown', status: 'skip' },
      { id: 'good', status: 'pass', seconds: 20 },
    ] });
    expect(r).toEqual(['good', 'unknown', 'bad']);
  });

  it('못 잰 것끼리는 이전 순위를 지킨다', () => {
    const r = rankResults({
      results: [{ id: 'c', status: 'skip' }, { id: 'b', status: 'skip' }],
      previous: ['b', 'c'],
    });
    expect(r).toEqual(['b', 'c']);
  });

  it('이전 순위에 없던 못 잰 것은 있던 것 뒤로', () => {
    const r = rankResults({
      results: [{ id: 'new', status: 'skip' }, { id: 'known', status: 'skip' }],
      previous: ['known'],
    });
    expect(r).toEqual(['known', 'new']);
  });

  it('시간이 같으면 id 로 갈라 순서가 흔들리지 않는다', () => {
    const r = rankResults({ results: [
      { id: 'b', status: 'pass', seconds: 10 },
      { id: 'a', status: 'pass', seconds: 10 },
    ] });
    expect(r).toEqual(['a', 'b']);
  });

  it('결과가 없으면 빈 목록', () => {
    expect(rankResults({ results: [] })).toEqual([]);
    expect(rankResults()).toEqual([]);
  });

  it('id 없는 항목은 버린다', () => {
    expect(rankResults({ results: [{ status: 'pass', seconds: 1 } as never] })).toEqual([]);
  });

  it('모르는 status 는 실패로 본다 — 모르는 것을 통과로 치지 않는다', () => {
    const r = rankResults({ results: [
      { id: 'weird', status: '???' as never },
      { id: 'ok', status: 'pass', seconds: 99 },
    ] });
    expect(r).toEqual(['ok', 'weird']);
  });
});

describe('readRanking — 순위 파일을 믿을 수 있나', () => {
  const 지금 = 1_000_000;
  const 파일 = (measuredAt: number, coder: string[] = ['a']) =>
    JSON.stringify({ measuredAt, roles: { coder, manager: ['m'] } });

  it('신선하면 역할별 순서를 준다', () => {
    const r = readRanking(파일(지금 - 60), { now: 지금 });
    expect(r?.coder).toEqual(['a']);
    expect(r?.manager).toEqual(['m']);
  });

  it('오래되면 null — 낡은 순위를 믿지 않는다', () => {
    expect(readRanking(파일(지금 - RANKING_MAX_AGE_SEC - 1), { now: 지금 })).toBeNull();
  });

  it('정확히 상한이면 아직 믿는다', () => {
    expect(readRanking(파일(지금 - RANKING_MAX_AGE_SEC), { now: 지금 })).not.toBeNull();
  });

  it('미래 시각이면 null — 시계가 어긋난 파일을 믿지 않는다', () => {
    expect(readRanking(파일(지금 + 10), { now: 지금 })).toBeNull();
  });

  it('깨진 것은 전부 null', () => {
    for (const bad of ['', '{', 'null', '[]', '{"roles":{}}', '{"measuredAt":"x","roles":{"coder":["a"]}}']) {
      expect(readRanking(bad, { now: 지금 })).toBeNull();
    }
  });

  it('역할 값이 배열이 아니면 그 역할은 비운다', () => {
    const r = readRanking(JSON.stringify({ measuredAt: 지금, roles: { coder: 'x', manager: ['m'] } }), { now: 지금 });
    expect(r?.coder).toEqual([]);
    expect(r?.manager).toEqual(['m']);
  });

  it('문자열이 아니면 null', () => {
    // @ts-expect-error 파일에서 읽어 넘기므로 타입이 보장되지 않는다
    expect(readRanking(null, { now: 지금 })).toBeNull();
  });
});
