// 피드백 노트 생성 순수 함수 테스트 (#9)
// AI 는 작가 노트(제안/개선안)만 생성한다. 서사/제목은 워커가 원본 로그·엔딩으로 채운다.

import { describe, it, expect } from 'vitest';
import { truncateLog, buildMessages, sseDeltaContent, MAX_LOG_CHARS } from './feedback-note';

describe('sseDeltaContent', () => {
  it('data 라인에서 delta.content 추출', () => {
    expect(sseDeltaContent('data: {"choices":[{"delta":{"content":"안녕"}}]}')).toBe('안녕');
  });
  it('[DONE]·비data·빈줄·파싱실패 → 빈 문자열', () => {
    expect(sseDeltaContent('data: [DONE]')).toBe('');
    expect(sseDeltaContent(': keep-alive')).toBe('');
    expect(sseDeltaContent('')).toBe('');
    expect(sseDeltaContent('data: not-json')).toBe('');
  });
  it('delta.content 없으면 빈 문자열(role 청크 등)', () => {
    expect(sseDeltaContent('data: {"choices":[{"delta":{"role":"assistant"}}]}')).toBe('');
  });
});

describe('truncateLog', () => {
  it('예산 이하면 그대로 join', () => {
    expect(truncateLog(['a', 'b', 'c'])).toBe('a\nb\nc');
  });

  it('예산 초과면 앞뒤 보존 + 중략, 길이 캡', () => {
    const log = [('x'.repeat(1000))].concat(Array.from({ length: 100 }, (_, i) => `줄${i}`.repeat(500)));
    const out = truncateLog(log, 5000);
    expect(out).toContain('중략');
    expect(out.length).toBeLessThan(6000);
    expect(out.startsWith('x')).toBe(true);
  });

  it('기본 예산 상수 사용', () => {
    const big = Array.from({ length: 5000 }, () => 'a'.repeat(100));
    const out = truncateLog(big);
    expect(out.length).toBeLessThan(MAX_LOG_CHARS + 200);
  });
});

describe('buildMessages (제안/개선안 전용)', () => {
  const input = {
    endingId: 'harmony',
    finalSceneId: 'scene_end',
    scenePath: ['a', 'b'],
    log: ['▶ 시작 (start)', '→ 선택: 문을 연다', '  방 안은 어두웠다.'],
    character: { protagonist: 'kael', ability: 'scholar', stigmaErosion: 30, hp: 8, maxHp: 10, inventory: ['검'] },
  };

  it('system 은 제안/개선안만 지시(서사 재작성 금지), user 에 엔딩·로그 포함', () => {
    const msgs = buildMessages(input);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('제안');
    expect(msgs[0].content).toContain('서사'); // "서사를 다시 쓰지 마라"
    expect(msgs[0].content).toContain('신규 시나리오 힌트');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toContain('조화'); // 엔딩 라벨
    expect(msgs[1].content).toContain('문을 연다'); // 로그 반영
    expect(msgs[1].content).toContain('kael'); // 캐릭터
  });

  it('캐릭터 없어도 안전', () => {
    const msgs = buildMessages({ endingId: 'fall', finalSceneId: 's', scenePath: [], log: ['x'], character: null });
    expect(msgs[1].content).toContain('몰락');
  });
});
