import { GoogleGenAI } from '@google/genai';
import Post from '@/models/post';
import { connectToDB } from '@/lib/db';
import { getAllTags } from '@/lib/posts';
import { env } from '@/lib/env';

// 본문 기반 AI 태그 추천 — 신규 글 제출 후 서버 백그라운드에서 호출(fire-and-forget).
// 포스트는 이미 저장돼 있고, 여기서는 Gemini 응답을 받아 리비전 없이 tags/aiTags 만 갱신한다.
// enji 봇(api/enji/route.ts)의 GoogleGenAI 호출·모델체인·transient 재시도 골격을 그대로 본떴다.

const GEMINI_MODEL_CHAIN = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

const TAG_SYSTEM_PROMPT = `당신은 블로그 글에 어울리는 한글 태그를 추천합니다.
- 본문 내용에 맞는 핵심 태그 3~5개를 고릅니다.
- 제공된 "기존 태그 목록"에 어울리는 게 있으면 우선 재사용합니다(새 태그 남발 금지).
- 사용자가 이미 단 태그는 다시 제안하지 않습니다.
- 반드시 JSON 문자열 배열로만 응답합니다. 예: ["여행","맛집","서울"]
- 설명·코드펜스 없이 배열만 출력합니다.`;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|HEADERS_TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND)\b/i.test(msg);
}

/** 한 태그 문자열 정제: 앞 #·양끝 따옴표·공백 제거. */
function normalizeTag(s: string): string {
  return s
    .trim()
    .replace(/^#+/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

/** 응답 텍스트에서 태그 후보 배열을 뽑는다: JSON 배열 우선, 실패 시 콤마/줄바꿈 분리. */
function extractTagList(text: string): string[] {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr: unknown = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(arr)) return arr.map((x) => String(x));
    } catch {
      /* JSON 실패 → 아래 폴백 */
    }
  }
  return cleaned.split(/[,\n]/);
}

/**
 * Gemini 응답 텍스트 → 최종 AI 태그 배열(순수 함수, 테스트 대상).
 * 정제·빈값 제외·대소문자 무시 dedup·**사용자 태그와 겹치는 것 제외(사람 우선)**·cap 제한.
 */
export function pickAiTags(rawText: string, userTags: string[], cap = 5): string[] {
  const userLower = new Set(userTags.map((t) => t.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of extractTagList(rawText)) {
    const tag = normalizeTag(item);
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (userLower.has(lower)) continue; // 사람 우선
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(tag);
    if (out.length >= cap) break;
  }
  return out;
}

async function callGeminiForTags(contents: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  let lastError: unknown;
  for (const model of GEMINI_MODEL_CHAIN) {
    try {
      const result = await ai.models.generateContent({
        model,
        config: { systemInstruction: TAG_SYSTEM_PROMPT },
        contents,
      });
      const text = result.text ?? '';
      if (!text.trim()) {
        lastError = new Error(`Empty response from model ${model}`);
        continue;
      }
      return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ai-tags] model=${model} failed:`, msg.slice(0, 200));
      if (!isTransientGeminiError(err)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** 본문 + 기존 태그목록으로 AI 태그를 추천받는다. 키 없음/에러 시 []. 절대 throw 안 함. */
export async function suggestTags(input: {
  title: string;
  htmlContent: string;
  allTags: string[];
  userTags: string[];
  cap?: number;
}): Promise<string[]> {
  if (!env.geminiApiKey) return [];
  const { title, htmlContent, allTags, userTags, cap = 5 } = input;
  const body = stripHtml(htmlContent).slice(0, 3000);
  const existing = allTags.slice(0, 200).join(', ');
  const contents = `제목: ${title}\n본문: ${body}\n기존 태그 목록(우선 재사용): ${existing}\n사용자가 이미 단 태그: ${userTags.join(', ')}`;
  try {
    const text = await callGeminiForTags(contents);
    return pickAiTags(text, userTags, cap);
  } catch (e) {
    console.warn('[ai-tags] suggestTags failed:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * 캐시 무효화 트리거 — 내부 revalidate 엔드포인트를 self-fetch 한다.
 *
 * 왜 직접 revalidatePath 를 안 쓰나: 이 코드는 fire-and-forget 백그라운드(응답 종료 후)라 request
 * scope 밖 → 거기서 부른 revalidatePath 는 무효(삼켜짐). 라우트 핸들러(/api/revalidate)를 self-fetch
 * 하면 그 핸들러는 정상 scope 라 revalidatePath 가 실제로 먹는다. 토큰 없으면 skip, 실패는 삼킨다
 * (best-effort — 다음 자연 갱신에 반영). 절대 throw 안 함.
 */
export async function triggerRevalidate(paths: string[]): Promise<void> {
  const token = env.revalidateToken.trim();
  if (!token || paths.length === 0) return;
  try {
    await fetch(`${env.siteUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': token },
      body: JSON.stringify({ paths }),
    });
  } catch (e) {
    console.warn('[ai-tags] triggerRevalidate failed:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * 신규 글 제출 후 백그라운드 실행: AI 태그를 받아 리비전 없이 문서 tags/aiTags 를 갱신.
 * PostRevision·version 을 만들지 않고(updatePostViews 패턴), timestamps 도 건드리지 않는다.
 * DB 갱신 후 내부 엔드포인트로 캐시를 무효화한다(백그라운드 revalidatePath 무효 회피).
 */
export async function generateAndUpdateTags(
  postId: string,
  input: { title: string; htmlContent: string; userTags: string[] },
): Promise<void> {
  try {
    if (!env.geminiApiKey) return;
    await connectToDB();
    const allTags = (await getAllTags()).map((t) => t.tag);
    const newAi = await suggestTags({
      title: input.title,
      htmlContent: input.htmlContent,
      allTags,
      userTags: input.userTags,
    });
    if (newAi.length === 0) return;

    await Post.findByIdAndUpdate(
      postId,
      { $set: { tags: [...input.userTags, ...newAi], aiTags: newAi } },
      { timestamps: false },
    );

    await triggerRevalidate([`/post/view/${postId}`, '/tags']);
  } catch (e) {
    console.warn('[ai-tags] generateAndUpdateTags failed:', e instanceof Error ? e.message : String(e));
  }
}
