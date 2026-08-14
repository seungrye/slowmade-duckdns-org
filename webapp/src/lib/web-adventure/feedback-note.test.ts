// 피드백 노트 생성 순수 함수 테스트 (#9)
// AI 는 작가 노트(제안/개선안)만 생성한다. 서사/제목은 워커가 원본 로그·엔딩으로 채운다.

import { describe, it, expect } from 'vitest';
import {
  truncateLog,
  buildMessages,
  sseDeltaContent,
  looksLikeProposal,
  extractEchoToken,
  stripEchoToken,
  MAX_LOG_CHARS,
} from './feedback-note';

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

// shim 이 직전 요청의 응답을 돌려주는 오배달이 실제로 있었다(#65). 서버를 고쳤지만
// 애플리케이션도 스스로 알아채야 한다 — 요청마다 토큰을 심고 응답에서 대조한다.
describe('에코 토큰', () => {
  it('buildMessages 에 토큰을 주면 system 지시에 포함된다', () => {
    const msgs = buildMessages(
      { endingId: 'harmony', finalSceneId: 's', scenePath: [], log: ['x'], character: null },
      { echoToken: 'tok-123' },
    );
    expect(msgs[0].content).toContain('[[NOTE:tok-123]]');
  });

  it('토큰을 안 주면 지시가 붙지 않는다(기존 동작)', () => {
    const msgs = buildMessages({ endingId: 'harmony', finalSceneId: 's', scenePath: [], log: ['x'], character: null });
    expect(msgs[0].content).not.toContain('[[NOTE:');
  });

  it('응답 첫 줄에서 토큰을 뽑는다', () => {
    expect(extractEchoToken('[[NOTE:abc-123]]\n## 안 가본 듯한 분기 아이디어')).toBe('abc-123');
  });

  it('토큰이 없으면 null (모델이 생략할 수 있다)', () => {
    expect(extractEchoToken('## 안 가본 듯한 분기 아이디어\n- 어쩌고')).toBeNull();
    expect(extractEchoToken('')).toBeNull();
  });

  it('저장 전에 토큰 줄을 걷어낸다', () => {
    const out = stripEchoToken('[[NOTE:abc-123]]\n## 안 가본 듯한 분기 아이디어\n- 어쩌고');
    expect(out.startsWith('## 안 가본')).toBe(true);
    expect(out).not.toContain('[[NOTE:');
  });

  it('토큰이 없으면 본문을 그대로 둔다', () => {
    const body = '## 안 가본 듯한 분기 아이디어\n- 어쩌고';
    expect(stripEchoToken(body)).toBe(body);
  });
});

// 실제 사고: LLM 이 "서사를 다시 쓰지 마라" 지시를 무시하고 다른 회차의 산문을 써냈는데,
// 검증 없이 authorNote 에 그대로 저장됐다. 형식 위반은 거부해 워커가 재시도하게 한다.
describe('looksLikeProposal', () => {
  it('요구 소제목이 있으면 제안으로 인정', () => {
    const ok = [
      '## 안 가본 듯한 분기 아이디어',
      '- 정령 활을 버리는 선택지',
      '## 신규 시나리오 힌트',
      '- 세계수 이전의 기록',
    ].join('\n');
    expect(looksLikeProposal(ok)).toBe(true);
  });

  it('소제목을 일부만 써도 인정(LLM 이 항목을 줄일 수 있다)', () => {
    expect(looksLikeProposal('## 빈약해 보완이 필요한 지점\n- 중반 밀도가 낮다')).toBe(true);
  });

  it('### 등 다른 깊이의 헤딩도 인정', () => {
    expect(looksLikeProposal('### 더 깊게 팔 만한 캐릭터/떡밥\n- 마릭 영감')).toBe(true);
  });

  it('서사를 써버린 응답은 거부 — 이번 사고 형태', () => {
    const bad = ['제목: 어떤 제목', '', '**서사:**', '', '차가운 금속 침대가 몸을 떠받치고 있었다.'].join('\n');
    expect(looksLikeProposal(bad)).toBe(false);
  });

  it('장면 산문만 있고 소제목이 없으면 거부', () => {
    expect(looksLikeProposal('▶ Scene 01 — 안개 낀 사냥터\n  안개가 깔린다. d20=12+7 성공.')).toBe(false);
  });

  it('빈 응답 거부', () => {
    expect(looksLikeProposal('')).toBe(false);
    expect(looksLikeProposal('   \n  ')).toBe(false);
  });

// #163 — 노트는 **한 회차의 로그**만 본다. 그런데 프롬프트가 그 사실을 말하지 않아,
// 그 회차가 안 지난 장면을 "없다·빈약하다" 라고 단정했다. 실제로 "세 달이 겹치는 새벽"
// 떡밥은 6 개 씬에서 회수되고 있는데도 "회수가 부족하다" 는 노트가 나왔다.
describe('한 경로만 본다는 사실을 프롬프트에 명시 (#163)', () => {
  const input = {
    endingId: 'harmony',
    finalSceneId: 's9',
    scenePath: ['a', 'b'],
    log: ['로그'],
  };

  it('경로 한정임을 못 박는다', () => {
    const sys = buildMessages(input)[0].content;
    expect(sys).toMatch(/한 경로|일부만|전체 이야기/);
  });

  it('없다고 단정하지 말라고 지시한다', () => {
    const sys = buildMessages(input)[0].content;
    expect(sys).toMatch(/단정하지|없다고/);
  });

  it('씬 목록을 주면 user 에 싣는다 — 이미 있는 것을 알게 한다', () => {
    const msgs = buildMessages({
      ...input,
      sceneIndex: [
        { id: 'omphalos_station', title: '정거장' },
        { id: 'kael_truth_revealed', title: '진실' },
      ],
    });
    expect(msgs[1].content).toContain('omphalos_station');
    expect(msgs[1].content).toContain('정거장');
  });

  it('씬 목록이 없으면 종전과 같다 — 하위호환', () => {
    const withOut = buildMessages(input)[1].content;
    expect(withOut).not.toContain('전체 씬 목록');
  });

  it('씬 목록이 많아도 프롬프트가 무한정 길어지지 않는다', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `s${i}`, title: `제목${i}` }));
    const msgs = buildMessages({ ...input, sceneIndex: many });
    expect(msgs[1].content.length).toBeLessThan(20000);
  });
});
});
