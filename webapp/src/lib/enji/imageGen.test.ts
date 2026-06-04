import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseImageCommand,
  buildPollinationsUrl,
  generateImage,
} from './imageGen';

describe('parseImageCommand', () => {
  it('/image 명령어 패턴이 정확히 파싱된다', () => {
    expect(parseImageCommand('/image a cat')).toEqual({ prompt: 'a cat' });
  });

  it('앞뒤 공백과 중간 다중 공백을 포함한 prompt 도 파싱된다', () => {
    expect(parseImageCommand('  /image  한국 마을 광장  ')).toEqual({
      prompt: '한국 마을 광장',
    });
  });

  it('명령어가 아니면 null 반환', () => {
    expect(parseImageCommand('hello')).toBeNull();
    expect(parseImageCommand('@enji-bot 안녕')).toBeNull();
    expect(parseImageCommand('/image')).toBeNull(); // prompt 없음
    expect(parseImageCommand('/image   ')).toBeNull(); // 공백만
  });

  it('대소문자 무관하게 /IMAGE, /Image 모두 인식', () => {
    expect(parseImageCommand('/IMAGE a dog')).toEqual({ prompt: 'a dog' });
    expect(parseImageCommand('/Image flower')).toEqual({ prompt: 'flower' });
  });
});

describe('buildPollinationsUrl', () => {
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
    // 기본 width/height 가 들어 있어야 한다.
    expect(url).toContain('width=1024');
    expect(url).toContain('height=1024');
  });

  it('seed 옵션이 주어지면 URL 에 포함된다', () => {
    const url = buildPollinationsUrl('cat', { seed: 42 });
    expect(url).toContain('seed=42');
  });

  it('특수문자 prompt 도 안전하게 인코딩된다', () => {
    const url = buildPollinationsUrl('cat & dog?', {});
    expect(url).toContain('cat%20%26%20dog%3F');
  });
});

describe('generateImage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('Pollinations 에서 이미지를 받아 MinIO 에 업로드하고 publicUrl 반환', async () => {
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

    // fetch 가 Pollinations URL 로 호출되었는지
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toMatch(/^https:\/\/gen\.pollinations\.ai\/image\/a%20cat/);

    // putObject 가 올바른 인자로 호출
    expect(putObject).toHaveBeenCalledTimes(1);
    const [bucket, key, body, size, meta] = putObject.mock.calls[0];
    expect(bucket).toBe('public');
    expect(key).toMatch(/^enji-images\/.*\.jpg$/);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(size).toBe(4);
    expect(meta).toEqual({ 'Content-Type': 'image/jpeg' });

    // 결과
    expect(result.key).toMatch(/^enji-images\/.*\.jpg$/);
    expect(result.url).toBe(`https://cdn.example.com/public/${result.key}`);
  });

  it('Pollinations 가 실패하면 예외를 던진다', async () => {
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

  it('MinIO 업로드 실패 시 예외 전파', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const putObject = vi.fn().mockRejectedValue(new Error('minio down'));
    const minioClient = { putObject } as unknown as Parameters<typeof generateImage>[1]['minioClient'];

    await expect(
      generateImage('cat', {
        minioClient,
        bucket: 'public',
        endpoint: 'cdn.example.com',
      }),
    ).rejects.toThrow(/minio down/);
  });

  it('POLLINATIONS_API_KEY 설정 시 Authorization: Bearer 헤더가 전송된다', async () => {
    vi.resetModules();
    const originalKey = process.env.POLLINATIONS_API_KEY;
    process.env.POLLINATIONS_API_KEY = 'sk_test_enji_xxx';

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
      const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
      expect(init).toBeDefined();
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers).toBeDefined();
      expect(headers!['Authorization']).toBe('Bearer sk_test_enji_xxx');
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
