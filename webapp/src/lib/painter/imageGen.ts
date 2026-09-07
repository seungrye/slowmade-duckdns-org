import crypto from 'crypto';
import { env } from '@/lib/env';
import { containsKorean, translateToEnglish } from './translate';

export interface PollinationsOptions {
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  nologo?: boolean;
}

/**
 * Builds the Pollinations.AI image GET URL (for painter-bot).
 * Model `flux` and 1024x1024 by default, with nologo=true.
 *
 * NOTE: essentially the same function as enji-bot's, but command parsing (parseImageCommand) is *removed* -
 * for painter-bot the mention itself is the trigger.
 */
export function buildPollinationsUrl(prompt: string, opts: PollinationsOptions): string {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const model = opts.model ?? 'flux';
  const nologo = opts.nologo ?? true;
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
  /** How many times to retry a transient Pollinations error (5xx, 429, network). 2 by default (3 attempts in all). */
  retries?: number;
  /** The delay between retries (ms), backing off by (n+1) each attempt. 3000 by default, 0 in tests. */
  retryDelayMs?: number;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The Pollinations fetch - a transient error (5xx, 429, network or timeout) backs off and retries.
 * pollinations.ai often returns 504 (gateway timeout) under load, so this wraps it rather than failing once and
 * ending in "drawing failed". A 4xx (not retryable) throws at once. Only an ok response is returned.
 */
async function fetchPollinationsWithRetry(
  url: string,
  headers: Record<string, string>,
  retries: number,
  retryDelayMs: number,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      lastErr = e; // network or timeout - retryable
      if (attempt >= retries) throw e;
      if (retryDelayMs > 0) await sleep(retryDelayMs * (attempt + 1));
      continue;
    }
    if (res.ok) return res;
    if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
      lastErr = new Error(`Pollinations ${res.status}`);
      if (retryDelayMs > 0) await sleep(retryDelayMs * (attempt + 1));
      continue;
    }
    throw new Error(`Pollinations ${res.status}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error('Pollinations unreachable');
}

/**
 * Fetches the image from Pollinations, uploads it under MinIO's painter-images/ prefix and returns the public URL.
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
  const res = await fetchPollinationsWithRetry(url, headers, opts.retries ?? 2, opts.retryDelayMs ?? 3000);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const randomStr = crypto.randomBytes(6).toString('hex');
  const key = `painter-images/${Date.now()}-${randomStr}.jpg`;
  await opts.minioClient.putObject(opts.bucket, key, buffer, buffer.length, {
    'Content-Type': 'image/jpeg',
  });

  const publicUrl = `https://${opts.endpoint}/${opts.bucket}/${key}`;
  return { key, url: publicUrl };
}

export interface TranslateAndGenerateOptions extends GenerateImageOptions {
  /** The Gemini API key - empty means no translation is attempted (Korean is passed through as is). */
  geminiApiKey: string;
}

export interface TranslateAndGenerateResult {
  key: string;
  url: string;
  /** The user's original prompt (Korean allowed). */
  originalPrompt: string;
  /** The English translation when translated. null for English input or a failed translation. */
  translatedPrompt: string | null;
  /** The prompt actually sent to Pollinations (English when translated, the original on failure). */
  usedPrompt: string;
}

/**
 * Automatic Korean-to-English prompt translation plus Pollinations image generation.
 *
 * - Korean detected -> a Gemini translation is attempted.
 * - A failed translation (Gemini timeout, no key, empty response) calls Pollinations with the original Korean prompt (the fallback).
 * - English input skips the translation step.
 */
export async function translateAndGenerate(
  originalPrompt: string,
  opts: TranslateAndGenerateOptions,
): Promise<TranslateAndGenerateResult> {
  let translatedPrompt: string | null = null;
  let usedPrompt = originalPrompt;

  if (containsKorean(originalPrompt) && opts.geminiApiKey) {
    try {
      const translated = await translateToEnglish(originalPrompt, opts.geminiApiKey);
      // translateToEnglish returns the original for English input, but
      // it is called here only after Korean was detected, so the result is the translation.
      if (translated && translated !== originalPrompt) {
        translatedPrompt = translated;
        usedPrompt = translated;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[painter-translate] failed, falling back to original prompt:', msg.slice(0, 200));
      // fallback: 원본 그대로
    }
  }

  const { key, url } = await generateImage(usedPrompt, opts);
  return { key, url, originalPrompt, translatedPrompt, usedPrompt };
}
