// 피드백 노트 생성 순수 함수 테스트 (#9)

import { describe, it, expect } from 'vitest';
import { truncateLog, buildMessages, parseOutput, sseDeltaContent, MAX_LOG_CHARS, AUTHOR_NOTE_MARKER } from './feedback-note';

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
    // head+tail+중략 마커 정도라 원본보다 훨씬 짧고 예산 근처.
    expect(out.length).toBeLessThan(6000);
    expect(out.startsWith('x')).toBe(true); // 앞부분 보존
  });

  it('기본 예산 상수 사용', () => {
    const big = Array.from({ length: 5000 }, () => 'a'.repeat(100)); // 매우 김
    const out = truncateLog(big);
    expect(out.length).toBeLessThan(MAX_LOG_CHARS + 200);
  });
});

describe('buildMessages', () => {
  const input = {
    endingId: 'harmony',
    finalSceneId: 'scene_end',
    scenePath: ['a', 'b'],
    log: ['▶ 시작 (start)', '→ 선택: 문을 연다', '  방 안은 어두웠다.'],
    character: { protagonist: 'kael', ability: 'scholar', stigmaErosion: 30, hp: 8, maxHp: 10, inventory: ['검'] },
  };

  it('system + user 2개, 형식 지시·엔딩·로그 포함', () => {
    const msgs = buildMessages(input);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain(AUTHOR_NOTE_MARKER);
    expect(msgs[0].content).toContain('제목:');
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

describe('parseOutput', () => {
  it('제목 + 서사 + 작가노트 분리', () => {
    const text = `제목: 어둠 속의 선택\n\n방 안은 어두웠다. 그는 문을 열었다.\n\n${AUTHOR_NOTE_MARKER}\n분기 아이디어: 문을 열지 않는 선택지.`;
    const r = parseOutput(text);
    expect(r.title).toBe('어둠 속의 선택');
    expect(r.narrative).toContain('문을 열었다');
    expect(r.narrative).not.toContain(AUTHOR_NOTE_MARKER);
    expect(r.authorNote).toContain('분기 아이디어');
  });

  it('마커 없으면 전체가 서사, 작가노트 빈 문자열', () => {
    const r = parseOutput('그냥 서사만 있음');
    expect(r.narrative).toBe('그냥 서사만 있음');
    expect(r.authorNote).toBe('');
  });

  it('제목 없으면 title 빈 문자열', () => {
    const r = parseOutput(`서사 본문\n${AUTHOR_NOTE_MARKER}\n노트`);
    expect(r.title).toBe('');
    expect(r.narrative).toBe('서사 본문');
    expect(r.authorNote).toBe('노트');
  });
});
