import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPollinationsUrl, generateImage } from './imageGen';

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

  it('Pollinations 실패 시 예외를 던진다', async () => {
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
      }),
    ).rejects.toThrow(/Pollinations/);
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
