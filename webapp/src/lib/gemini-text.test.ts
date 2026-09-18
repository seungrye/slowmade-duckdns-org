import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * 글 생성 공용 호출 (#471).
 *
 * 여기서 보는 것은 **모델 차례를 언제 넘기는가**다. 아무 때나 넘기면 잘못된 요청 하나에
 * 두 번 부르고 두 번 기다린다. 안 넘기면 한 모델이 한도에 걸렸을 때 그날 풀이가 통째로
 * 템플릿으로 떨어진다.
 */

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
vi.mock('@/lib/env', () => ({ env: { geminiApiKey: 'test-key' } }));

const { askGemini, isTransient, TEXT_MODELS } = await import('./gemini-text');

describe('isTransient', () => {
  it('한도·서버 오류는 다시 해 볼 만하다', () => {
    expect(isTransient(new Error('429 RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isTransient(new Error('503 UNAVAILABLE'))).toBe(true);
    expect(isTransient(new Error('fetch failed'))).toBe(true);
  });

  it('요청이 잘못된 것은 다음 모델도 똑같이 실패한다', () => {
    expect(isTransient(new Error('400 INVALID_ARGUMENT'))).toBe(false);
    expect(isTransient(new Error('API key not valid'))).toBe(false);
  });
});

describe('askGemini', () => {
  beforeEach(() => generateContent.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('첫 모델이 답하면 그대로 돌려준다', async () => {
    generateContent.mockResolvedValueOnce({ text: '  오늘은 좋은 날이에요.  ' });
    await expect(askGemini([{ role: 'user', content: '카드' }])).resolves.toBe('오늘은 좋은 날이에요.');
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].model).toBe(TEXT_MODELS[0]);
  });

  it('한도에 걸리면 다음 모델로 넘어간다', async () => {
    generateContent
      .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce({ text: '두 번째 모델이 씀' });
    await expect(askGemini([{ role: 'user', content: '카드' }])).resolves.toBe('두 번째 모델이 씀');
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([...TEXT_MODELS]);
  });

  it('요청이 잘못된 것이면 다음 모델을 안 부른다', async () => {
    generateContent.mockRejectedValueOnce(new Error('400 INVALID_ARGUMENT'));
    await expect(askGemini([{ role: 'user', content: '카드' }])).rejects.toThrow('400');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('빈 답도 실패로 보고 다음 모델로 넘어간다', async () => {
    // 빈 풀이가 그대로 나가면 안 된다.
    generateContent
      .mockResolvedValueOnce({ text: '   ' })
      .mockResolvedValueOnce({ text: '제대로 된 글' });
    await expect(askGemini([{ role: 'user', content: '카드' }])).resolves.toBe('제대로 된 글');
  });

  it('다 실패하면 던진다 — 폴백은 부르는 쪽이 정한다', async () => {
    // 모델 수만큼만 거부시킨다 — mockRejectedValue 로 두면 안 쓰인 거부 프로미스가 남는다.
    TEXT_MODELS.forEach(() => generateContent.mockRejectedValueOnce(new Error('503 UNAVAILABLE')));
    await expect(askGemini([{ role: 'user', content: '카드' }])).rejects.toThrow();
  });

  it('system 은 systemInstruction 으로, 나머지는 사용자 발화로 간다', async () => {
    generateContent.mockResolvedValueOnce({ text: '답' });
    await askGemini([
      { role: 'system', content: '존댓말로 써라' },
      { role: 'user', content: '바보 카드 정방향' },
    ]);
    const arg = generateContent.mock.calls[0][0];
    expect(arg.config.systemInstruction).toBe('존댓말로 써라');
    expect(arg.contents[0].parts[0].text).toBe('바보 카드 정방향');
  });
});
