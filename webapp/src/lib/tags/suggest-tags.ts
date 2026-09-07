import { GoogleGenAI } from '@google/genai';
import Post from '@/models/post';
import { connectToDB } from '@/lib/db';
import { getAllTags } from '@/lib/posts';
import { env } from '@/lib/env';

// AI tag suggestions from the body - called in a server background task after a new post is submitted (fire and forget).
// The post is already saved; this takes Gemini's response and updates only tags/aiTags, with no revision.
// It follows the enji bot's (api/enji/route.ts) GoogleGenAI call, model chain and transient-retry skeleton as is.

const GEMINI_MODEL_CHAIN = [
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

/**
 * The chain used only for requests with an image (#234).
 *
 * **With an image attached, Gemma ignores Korean instructions and answers in English** (measured):
 *   gemma-4-31b-it        -> "A screenshot from a pixel art style game."
 *   gemini-3.1-flash-lite -> "블루 슬라임과 전투하는 게임 화면"
 * Left alone, that produces English tags. A text-only post keeps the existing chain - there is no reason to change it.
 */
const GEMINI_VISION_CHAIN = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

/** Two images are enough for tagging. More does not improve the tags and only adds latency. */
const MAX_IMAGES = 2;

/**
 * The character budget for the existing tag list (#251).
 *
 * It used to cut by **count**, with `allTags.slice(0, 200)`. With 396 distinct tags across public posts, 196 were
 * never seen by the model at all, and with no `$sort` in `__getAllTags` the 196 cut off were **arbitrary** rather
 * than "the less-used ones" - a relevant tag on the invisible side cannot be reused however much you want to.
 * (The reuse instruction itself was working well: 32 of 35 AI tags were tags people also use.)
 *
 * All 396 come to 3,336 characters (measured). So now **everything is included.** This value is only a safeguard for
 * when tags grow into the thousands, and when it does cut, the least-used go first.
 */
export const TAG_LIST_CHAR_BUDGET = 10_000;

/** The separator used to join the list. Its length counts toward the budget too. */
const TAG_SEPARATOR = ', ';

/**
 * The existing tags to put in the prompt - most-used first, as many as the budget allows (#251).
 *
 * Sending past the budget only gets truncated at the model's end, so it is fitted here, separators included.
 */
export function fitTagsToBudget(
  tags: { tag: string; count: number }[],
  budget: number = TAG_LIST_CHAR_BUDGET,
): string[] {
  // Ties on count are broken by name - the aggregate result is unsorted, so without it the prompt would differ
  // from run to run on the same data.
  const sorted = [...tags].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  const out: string[] = [];
  let used = 0;
  for (const { tag } of sorted) {
    const cost = out.length === 0 ? tag.length : TAG_SEPARATOR.length + tag.length;
    if (used + cost > budget) break;
    out.push(tag);
    used += cost;
  }
  return out;
}

/**
 * The cap for sending inline. Above it, it falls back to the thumbnail.
 *
 * Size **does not drive the cost** - the thumbnail (16KB) and the original (31KB) both came to 1125 input tokens
 * (measured), because Gemini normalises images internally. So the **original**, with its detail intact, is used
 * normally, and this cap is only a safeguard against very large files.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

type InlinePart = { inlineData: { mimeType: string; data: string } };
type TagPart = { text: string } | InlinePart;

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

/** Cleans one tag string: strips a leading #, surrounding quotes and whitespace. */
function normalizeTag(s: string): string {
  return s
    .trim()
    .replace(/^#+/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

/** Extracts the candidate tags from the response text: a JSON array first, falling back to splitting on commas or newlines. */
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
 * Gemini's response text -> the final AI tag array (a pure function, under test).
 * It cleans, drops empties, deduplicates case-insensitively, **excludes anything the user already tagged (people win)**, and applies the cap.
 */
export function pickAiTags(rawText: string, userTags: string[], cap = 5): string[] {
  const userLower = new Set(userTags.map((t) => t.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of extractTagList(rawText)) {
    const tag = normalizeTag(item);
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (userLower.has(lower)) continue; // people win
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(tag);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Fetches an image and turns it into an inline part.
 *
 * **Failure gives null - it never blocks tagging.** Losing every tag because an image could not be fetched costs more
 * (this file's existing principle: swallow the failure and continue).
 *
 * The original is tried first, falling back to the thumbnail when it is absent or over the cap.
 */
async function fetchInlineImage(
  image: { url?: string | null; thumbnailUrl?: string | null },
): Promise<InlinePart | null> {
  for (const candidate of [image.url, image.thumbnailUrl]) {
    if (!candidate) continue;
    try {
      const res = await fetch(candidate);
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.byteLength > MAX_IMAGE_BYTES) continue; // on to the next candidate (the thumbnail)
      const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
      return { inlineData: { mimeType, data: bytes.toString('base64') } };
    } catch {
      // 이 후보는 포기하고 다음으로. 둘 다 실패하면 텍스트만으로 진행한다.
    }
  }
  return null;
}

async function callGeminiForTags(parts: TagPart[], chain: string[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  let lastError: unknown;
  for (const model of chain) {
    try {
      const result = await ai.models.generateContent({
        model,
        config: { systemInstruction: TAG_SYSTEM_PROMPT },
        contents: [{ role: 'user', parts }],
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

/** Gets AI tag suggestions from the body plus the existing tag list. [] with no key or on error. It never throws. */
export async function suggestTags(input: {
  title: string;
  htmlContent: string;
  /** The existing tags and their use counts (#251). Sending the most-used first helps reuse. */
  allTags: { tag: string; count: number }[];
  userTags: string[];
  cap?: number;
  /** The images attached to the post (#234). Tags the title and body alone could not produce come from here. */
  imageUrls?: { url?: string | null; thumbnailUrl?: string | null }[];
}): Promise<string[]> {
  if (!env.geminiApiKey) return [];
  const { title, htmlContent, allTags, userTags, cap = 5, imageUrls = [] } = input;
  const body = stripHtml(htmlContent).slice(0, 3000);
  const existing = fitTagsToBudget(allTags).join(TAG_SEPARATOR);

  const inlineImages = (
    await Promise.all(imageUrls.slice(0, MAX_IMAGES).map(fetchInlineImage))
  ).filter((p): p is InlinePart => p !== null);

  const contents = `제목: ${title}\n본문: ${body}\n기존 태그 목록(우선 재사용): ${existing}\n사용자가 이미 단 태그: ${userTags.join(', ')}`
    + (inlineImages.length ? '\n첨부된 이미지도 함께 보고 고르세요.' : '');

  // The chain changes only when an image was **actually fetched** - without one it is a text request and the
  // existing chain is the right one.
  const chain = inlineImages.length ? GEMINI_VISION_CHAIN : GEMINI_MODEL_CHAIN;
  try {
    const text = await callGeminiForTags([{ text: contents }, ...inlineImages], chain);
    return pickAiTags(text, userTags, cap);
  } catch (e) {
    console.warn('[ai-tags] suggestTags failed:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * Triggers cache invalidation - it self-fetches the internal revalidate endpoint.
 *
 * Why not call revalidatePath directly: this code is a fire-and-forget background task (after the response ends) and
 * so outside the request scope - a revalidatePath called there is ineffective (swallowed). Self-fetching the route
 * handler (/api/revalidate) puts it in a proper scope, where revalidatePath actually takes effect. Without a token it
 * is skipped, and failures are swallowed (best effort - it lands on the next natural refresh). It never throws.
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
 * Runs in the background after a new post is submitted: it gets AI tags and updates the document's tags/aiTags with no revision.
 * It creates neither a PostRevision nor a version (the updatePostViews pattern) and does not touch timestamps.
 * After the DB update it invalidates the cache through the internal endpoint (avoiding the ineffective background revalidatePath).
 */
export async function generateAndUpdateTags(
  postId: string,
  input: {
    title: string;
    htmlContent: string;
    userTags: string[];
    /** The images attached to the post (#234). */
    imageUrls?: { url?: string | null; thumbnailUrl?: string | null }[];
  },
): Promise<void> {
  try {
    if (!env.geminiApiKey) return;
    await connectToDB();
    // The use counts are passed straight through (#251) - putting the most-used tags first increases reuse.
    const allTags = await getAllTags();
    const newAi = await suggestTags({
      title: input.title,
      htmlContent: input.htmlContent,
      allTags,
      userTags: input.userTags,
      imageUrls: input.imageUrls,
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
