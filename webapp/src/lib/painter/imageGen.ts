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
 * Pollinations.AI 이미지 GET URL 빌더 (painter-bot 용).
 * 기본 모델 `flux`, 기본 1024x1024, nologo=true.
 *
 * NOTE: enji-bot 의 동일 함수와 본질적으로 같지만, 명령어 파싱(parseImageCommand)
 * 은 painter-bot 에선 멘션 자체가 트리거이므로 *제거*.
 */
export function buildPollinationsUrl(prompt: string, opts: PollinationsOptions): string {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const model = opts.model ?? 'flux';
  const nologo = opts.nologo ?? true;
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
  /** Pollinations 일시 오류(5xx/429/네트워크) 재시도 횟수. 기본 2 (총 최대 3회 시도). */
  retries?: number;
  /** 재시도 간 지연(ms). 시도마다 (n+1)배 백오프. 기본 3000. 테스트에선 0. */
  retryDelayMs?: number;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pollinations fetch — 일시적 오류(5xx/429/네트워크·타임아웃)면 백오프 후 재시도.
 * pollinations.ai 는 과부하 시 504(gateway timeout)를 자주 반환하므로, 한 번에 실패해
 * "그림 그리기 실패" 로 끝나지 않도록 감싼다. 4xx(재시도 불가)는 즉시 throw. ok 응답만 반환.
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
      lastErr = e; // 네트워크/타임아웃 — 재시도 대상
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
 * Pollinations 에서 이미지를 받아 MinIO 의 painter-images/ prefix 에 업로드, public URL 반환.
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
  /** Gemini API key — 빈 문자열이면 번역 시도 X (한글이어도 원본 그대로). */
  geminiApiKey: string;
}

export interface TranslateAndGenerateResult {
  key: string;
  url: string;
  /** 사용자가 입력한 원본 prompt (한국어 가능). */
  originalPrompt: string;
  /** 번역됐을 때 영문 번역본. 영문 입력 / 번역 실패 시 null. */
  translatedPrompt: string | null;
  /** 실제로 Pollinations 에 전달한 prompt (번역됐으면 영문, 실패 시 원본). */
  usedPrompt: string;
}

/**
 * 한글 prompt 자동 영문 번역 + Pollinations 이미지 생성.
 *
 * - 한글 감지 시 Gemini 번역 시도.
 * - 번역 실패 (Gemini 타임아웃 / 키 없음 / 빈 응답) 시 원본 한글 prompt 로 Pollinations 호출 (fallback).
 * - 영문 입력은 번역 단계 skip.
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
      // translateToEnglish 가 영문 입력엔 원본을 그대로 반환하지만,
      // 여기선 이미 한글 확인 후 호출했으므로 결과는 번역본.
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
