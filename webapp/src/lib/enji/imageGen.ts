import crypto from 'crypto';
import { env } from '@/lib/env';

/**
 * Parses the `/image <prompt>` command.
 * - case-insensitive (`/IMAGE`, `/Image` and so on)
 * - surrounding whitespace allowed
 * - null when the prompt is empty (or whitespace only)
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
 * Builds the Pollinations.AI image GET URL.
 * - model `flux` and 1024x1024 by default, with nologo=true
 */
export function buildPollinationsUrl(prompt: string, opts: PollinationsOptions): string {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const model = opts.model ?? 'flux';
  const nologo = opts.nologo ?? true;
  // encodeURIComponent turns ' ' into '%20' and is safe for Korean and special characters.
  // gen.pollinations.ai is the new standard (it supports API key auth). image.pollinations.ai is legacy and
  // returns 402 once the anonymous IP rate limit is hit.
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
 * Fetches the image from Pollinations, uploads it to MinIO and returns the public URL.
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
