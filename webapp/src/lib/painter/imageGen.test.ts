import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mockGenerateContent };
  }
  return { GoogleGenAI: MockGoogleGenAI };
});

import { buildPollinationsUrl, generateImage, translateAndGenerate } from './imageGen';

describe('painter buildPollinationsUrl', () => {
  it('기본 옵션이 포함된 Pollinations URL 을 생성한다', () => {
    const url = buildPollinationsUrl('a cat', { width: 512, height: 512 });
    expect(url).toMatch(/^https:\/\/gen\.pollinations\.ai\/image\/a%20cat\?/);
    expect(url).toContain('width=512');
    expect(url).toContain('height=512');
    expect(url).toContain('model=flux');
    expect(url).toContain('nologo=true');
  });

  it('한국어 prompt 도 정확히 URL encode 된다', () => {
    const url = buildPollinationsUrl('한국 마을 광장', {});
    expect(url).toContain(encodeURIComponent('한국 마을 광장'));
    expect(url).toContain('width=1024');
    expect(url).toContain('height=1024');
  });

  it('seed 옵션이 주어지면 URL 에 포함된다', () => {
    const url = buildPollinationsUrl('cat', { seed: 42 });
    expect(url).toContain('seed=42');
  });
});

describe('painter generateImage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('Pollinations 이미지를 받아 painter-images/ prefix 로 MinIO 에 업로드한다', async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(fakeBytes.buffer),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const putObject = vi.fn().mockResolvedValue(undefined);
    const minioClient = { putObject } as unknown as Parameters<typeof generateImage>[1]['minioClient'];

    const result = await generateImage('a cat', {
      minioClient,
      bucket: 'public',
      endpoint: 'cdn.example.com',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toMatch(/^https:\/\/gen\.pollinations\.ai\/image\/a%20cat/);

    expect(putObject).toHaveBeenCalledTimes(1);
    const [bucket, key, body, size, meta] = putObject.mock.calls[0];
    expect(bucket).toBe('public');
    // painter-bot 은 별도 prefix 사용 (enji-images/ X)
    expect(key).toMatch(/^painter-images\/.*\.jpg$/);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(size).toBe(4);
    expect(meta).toEqual({ 'Content-Type': 'image/jpeg' });

    expect(result.key).toMatch(/^painter-images\/.*\.jpg$/);
    expect(result.url).toBe(`https://cdn.example.com/public/${result.key}`);
  });

  it('Pollinations 504(일시 오류)는 재시도하고, 다음 시도가 성공하면 이미지를 반환한다', async () => {
    const fakeBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 504, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
      .mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(fakeBytes.buffer) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const putObject = vi.fn().mockResolvedValue(undefined);
    const minioClient = { putObject } as unknown as Parameters<typeof generateImage>[1]['minioClient'];

    const result = await generateImage('a cat', {
      minioClient,
      bucket: 'public',
      endpoint: 'cdn.example.com',
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2); // 504 → 재시도 → 성공
    expect(putObject).toHaveBeenCalledTimes(1);
    expect(result.url).toBe(`https://cdn.example.com/public/${result.key}`);
  });

  it('Pollinations 가 계속 실패하면 재시도를 소진한 뒤 예외를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const putObject = vi.fn();
    const minioClient = { putObject } as unknown as Parameters<typeof generateImage>[1]['minioClient'];

    await expect(
      generateImage('cat', {
        minioClient,
        bucket: 'public',
        endpoint: 'cdn.example.com',
        retries: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Pollinations/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 최초 1 + 재시도 2
    expect(putObject).not.toHaveBeenCalled();
  });

  it('4xx(재시도 불가) 오류는 즉시 예외를 던진다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const putObject = vi.fn();
    const minioClient = { putObject } as unknown as Parameters<typeof generateImage>[1]['minioClient'];

    await expect(
      generateImage('cat', {
        minioClient,
        bucket: 'public',
        endpoint: 'cdn.example.com',
        retries: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Pollinations 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 재시도 없음
    expect(putObject).not.toHaveBeenCalled();
  });

  it('POLLINATIONS_API_KEY 설정 시 Authorization: Bearer 헤더가 전송된다', async () => {
    vi.resetModules();
    const originalKey = process.env.POLLINATIONS_API_KEY;
    process.env.POLLINATIONS_API_KEY = 'sk_test_painter_xxx';

    try {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const mod = await import('./imageGen');
      const putObject = vi.fn().mockResolvedValue(undefined);
      const minioClient = { putObject } as unknown as Parameters<typeof mod.generateImage>[1]['minioClient'];

      await mod.generateImage('a cat', {
        minioClient,
        bucket: 'public',
        endpoint: 'cdn.example.com',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const callArgs = fetchMock.mock.calls[0];
      const init = callArgs[1] as RequestInit | undefined;
      expect(init).toBeDefined();
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers).toBeDefined();
      expect(headers!['Authorization']).toBe('Bearer sk_test_painter_xxx');
    } finally {
      if (originalKey === undefined) {
        delete process.env.POLLINATIONS_API_KEY;
      } else {
        process.env.POLLINATIONS_API_KEY = originalKey;
      }
      vi.resetModules();
    }
  });

  it('POLLINATIONS_API_KEY 미설정 시 Authorization 헤더 없이 호출된다', async () => {
    vi.resetModules();
    const originalKey = process.env.POLLINATIONS_API_KEY;
    delete process.env.POLLINATIONS_API_KEY;

    try {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const mod = await import('./imageGen');
      const putObject = vi.fn().mockResolvedValue(undefined);
      const minioClient = { putObject } as unknown as Parameters<typeof mod.generateImage>[1]['minioClient'];

      await mod.generateImage('a cat', {
        minioClient,
        bucket: 'public',
        endpoint: 'cdn.example.com',
      });

      const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    } finally {
      if (originalKey !== undefined) {
        process.env.POLLINATIONS_API_KEY = originalKey;
      }
      vi.resetModules();
    }
  });
});

describe('painter translateAndGenerate', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  function setupFetchMock() {
    const fakeBytes = new Uint8Array([9, 9, 9]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(fakeBytes.buffer),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  function setupMinio() {
    const putObject = vi.fn().mockResolvedValue(undefined);
    const minioClient = { putObject } as unknown as Parameters<typeof translateAndGenerate>[1]['minioClient'];
    return { putObject, minioClient };
  }

  it('한글 prompt → Gemini 번역 후 번역된 영문으로 Pollinations 호출', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: 'Korean village square at dawn' });
    const fetchMock = setupFetchMock();
    const { minioClient } = setupMinio();

    const result = await translateAndGenerate('한국 마을 광장 새벽', {
      minioClient,
      bucket: 'public',
      endpoint: 'cdn.example.com',
      geminiApiKey: 'gemini-key',
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    // 번역된 영문이 URL 에 들어가야 함 (한글 원본 X)
    expect(calledUrl).toContain(encodeURIComponent('Korean village square at dawn'));
    expect(calledUrl).not.toContain(encodeURIComponent('한국 마을 광장 새벽'));

    expect(result.originalPrompt).toBe('한국 마을 광장 새벽');
    expect(result.translatedPrompt).toBe('Korean village square at dawn');
    expect(result.usedPrompt).toBe('Korean village square at dawn');
    expect(result.url).toMatch(/painter-images/);
  });

  it('영문 prompt → 번역 단계 skip + Pollinations 직접 호출', async () => {
    const fetchMock = setupFetchMock();
    const { minioClient } = setupMinio();

    const result = await translateAndGenerate('a cat dancing on the moon', {
      minioClient,
      bucket: 'public',
      endpoint: 'cdn.example.com',
      geminiApiKey: 'gemini-key',
    });

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.originalPrompt).toBe('a cat dancing on the moon');
    expect(result.translatedPrompt).toBeNull();
    expect(result.usedPrompt).toBe('a cat dancing on the moon');
  });

  it('번역 실패 시 원본 한글 prompt 로 Pollinations 호출 (fallback)', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Gemini timeout'));
    const fetchMock = setupFetchMock();
    const { minioClient } = setupMinio();

    const result = await translateAndGenerate('한국 마을', {
      minioClient,
      bucket: 'public',
      endpoint: 'cdn.example.com',
      geminiApiKey: 'gemini-key',
    });

    expect(mockGenerateContent).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain(encodeURIComponent('한국 마을'));
    expect(result.originalPrompt).toBe('한국 마을');
    expect(result.translatedPrompt).toBeNull();
    expect(result.usedPrompt).toBe('한국 마을');
  });

  it('geminiApiKey 가 비어있고 한글 입력이면 번역 시도 X, 원본으로 fallback', async () => {
    const fetchMock = setupFetchMock();
    const { minioClient } = setupMinio();

    const result = await translateAndGenerate('한국 마을', {
      minioClient,
      bucket: 'public',
      endpoint: 'cdn.example.com',
      geminiApiKey: '',
    });

    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.originalPrompt).toBe('한국 마을');
    expect(result.translatedPrompt).toBeNull();
    expect(result.usedPrompt).toBe('한국 마을');
  });
});
