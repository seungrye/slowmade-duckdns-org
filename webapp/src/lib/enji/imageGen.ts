import crypto from 'crypto';
import { env } from '@/lib/env';

/**
 * `/image <prompt>` 명령어 파싱.
 * - 대소문자 무관 (`/IMAGE`, `/Image` 등 허용)
 * - 앞뒤 공백 허용
 * - prompt 가 비어 있으면 (또는 공백만) null
 */
export function parseImageCommand(input: string): { prompt: string } | null {
  if (!input) return null;
  const m = input.trim().match(/^\/image\s+(.+)$/i);
  if (!m) return null;
  const prompt = m[1].trim();
  if (!prompt) return null;
  return { prompt };
}

export interface PollinationsOptions {
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  nologo?: boolean;
}

/**
 * Pollinations.AI 이미지 GET URL 빌더.
 * - 기본 모델 `flux`, 기본 1024x1024, nologo=true
 */
export function buildPollinationsUrl(prompt: string, opts: PollinationsOptions): string {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const model = opts.model ?? 'flux';
  const nologo = opts.nologo ?? true;
  // encodeURIComponent 가 ' ' 을 '%20' 으로 변환하고 한국어/특수문자 안전.
  // gen.pollinations.ai 가 새 표준 (API key 인증 지원). image.pollinations.ai 는 legacy 이며
  // 익명 IP rate limit 에 걸려 402 반환.
  const base = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`;
  const params = new URLSearchParams();
  params.set('width', String(width));
  params.set('height', String(height));
  params.set('model', model);
  params.set('nologo', String(nologo));
  if (opts.seed !== undefined) params.set('seed', String(opts.seed));
  return `${base}?${params.toString()}`;
}

interface MinioPutClient {
  putObject(
    bucket: string,
    objectName: string,
    stream: Buffer,
    size: number,
    metaData: Record<string, string>,
  ): Promise<unknown>;
}

export interface GenerateImageOptions {
  minioClient: MinioPutClient;
  bucket: string;
  endpoint: string;
  pollinations?: PollinationsOptions;
}

/**
 * Pollinations 에서 이미지를 받아 MinIO 에 업로드, public URL 반환.
 */
export async function generateImage(
  prompt: string,
  opts: GenerateImageOptions,
): Promise<{ key: string; url: string }> {
  const url = buildPollinationsUrl(prompt, opts.pollinations ?? {});
  const headers: Record<string, string> = {};
  if (env.pollinations.apiKey) {
    headers['Authorization'] = `Bearer ${env.pollinations.apiKey}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Pollinations ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const randomStr = crypto.randomBytes(6).toString('hex');
  const key = `enji-images/${Date.now()}-${randomStr}.jpg`;
  await opts.minioClient.putObject(opts.bucket, key, buffer, buffer.length, {
    'Content-Type': 'image/jpeg',
  });

  const publicUrl = `https://${opts.endpoint}/${opts.bucket}/${key}`;
  return { key, url: publicUrl };
}
