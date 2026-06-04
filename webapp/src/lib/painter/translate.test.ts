import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Gemini SDK mock — translateToEnglish 가 GoogleGenAI 를 사용한다고 가정.
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent };
  }
  return { GoogleGenAI: MockGoogleGenAI };
});

import { containsKorean, translateToEnglish } from './translate';

describe('painter containsKorean', () => {
  it('한글 음절이 하나라도 있으면 true 를 반환한다', () => {
    expect(containsKorean('한국 마을')).toBe(true);
    expect(containsKorean('Korean 마을')).toBe(true);
    expect(containsKorean('도트')).toBe(true);
    expect(containsKorean('한')).toBe(true);
  });

  it('영문/숫자/기호만 있으면 false 를 반환한다', () => {
    expect(containsKorean('Korean village')).toBe(false);
    expect(containsKorean('pixel art 16-bit RPG')).toBe(false);
    expect(containsKorean('')).toBe(false);
    expect(containsKorean('!@#$%^&*()')).toBe(false);
  });
});

describe('painter translateToEnglish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('영문 입력은 Gemini 호출 없이 그대로 반환한다', async () => {
    const result = await translateToEnglish('Korean village', 'fake-key');
    expect(result).toBe('Korean village');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('한글 입력은 Gemini 호출 후 번역 결과를 반환한다', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'Korean village square at dawn' });
    const result = await translateToEnglish('한국 마을 광장 새벽', 'test-key');
    expect(result).toBe('Korean village square at dawn');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    // user prompt 가 gemini contents 에 포함되어야 함
    const callArg = mockGenerateContent.mock.calls[0][0];
    expect(JSON.stringify(callArg)).toContain('한국 마을 광장 새벽');
  });

  it('Gemini 가 빈 응답을 주면 예외를 던진다 (caller fallback)', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '' });
    await expect(translateToEnglish('한국 마을', 'key')).rejects.toThrow();
  });

  it('Gemini 호출이 실패하면 예외를 던진다 (caller fallback)', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini timeout'));
    await expect(translateToEnglish('한국', 'key')).rejects.toThrow(/Gemini|timeout/i);
  });

  it('API key 가 비어있으면 예외를 던진다', async () => {
    await expect(translateToEnglish('한국', '')).rejects.toThrow();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('번역 결과의 양 끝 공백/따옴표를 제거한다', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: '  "Korean village"  \n' });
    const result = await translateToEnglish('한국 마을', 'key');
    expect(result).toBe('Korean village');
  });
});
