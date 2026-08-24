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

/**
 * 이미지가 붙은 요청 전용 체인 (#234).
 *
 * **Gemma 는 이미지가 붙으면 한국어 지시를 무시하고 영어로 답한다**(실측):
 *   gemma-4-31b-it        → "A screenshot from a pixel art style game."
 *   gemini-3.1-flash-lite → "블루 슬라임과 전투하는 게임 화면"
 * 그대로 두면 영어 태그가 달린다. 텍스트만인 글은 기존 체인 그대로 — 바꿀 이유가 없다.
 */
const GEMINI_VISION_CHAIN = [
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

/** 태깅에 두 장이면 충분하다. 더 보내도 태그가 나아지지 않고 지연만 는다. */
const MAX_IMAGES = 2;

/**
 * 기존 태그 목록에 쓸 글자 예산 (#251).
 *
 * 예전엔 `allTags.slice(0, 200)` 으로 **개수**를 잘랐다. 공개글 고유 태그가 396개라 196개는
 * 모델이 아예 못 봤고, `__getAllTags` 에 `$sort` 가 없어 잘려 나가는 196개가 "덜 쓰이는 것"이
 * 아니라 **임의로** 정해졌다 — 관련 있는 태그가 안 보이는 쪽에 있으면 재사용하고 싶어도 할 수
 * 없다. (재사용 지시 자체는 잘 먹고 있었다: AI 태그 35개 중 32개가 사람도 쓰는 태그였다.)
 *
 * 전체 396개를 다 넣어도 3,336자다(실측). 그래서 지금은 **전부 싣는다.** 이 값은 태그가
 * 수천 개로 늘어날 때를 위한 안전장치일 뿐이고, 잘릴 때는 적게 쓰인 것부터 잘린다.
 */
export const TAG_LIST_CHAR_BUDGET = 10_000;

/** 목록을 이을 때 쓰는 구분자. 길이를 셀 때 이 길이도 함께 센다. */
const TAG_SEPARATOR = ', ';

/**
 * 프롬프트에 실을 기존 태그 — 많이 쓰인 순으로, 예산 안에서 최대한 (#251).
 *
 * 예산을 넘겨 보내 봐야 모델 쪽에서 잘리므로 구분자까지 세어 여기서 맞춘다.
 */
export function fitTagsToBudget(
  tags: { tag: string; count: number }[],
  budget: number = TAG_LIST_CHAR_BUDGET,
): string[] {
  // 횟수가 같을 때 이름으로 한 번 더 가른다 — 집계 결과는 정렬돼 있지 않아서, 안 그러면
  // 같은 데이터인데도 실행마다 프롬프트가 달라진다.
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
 * 인라인으로 실어 보낼 상한. 넘으면 썸네일로 내려간다.
 *
 * 크기가 **비용을 좌우하지는 않는다** — 썸네일(16KB)과 원본(31KB)의 입력 토큰이 똑같이
 * 1125 였다(실측). Gemini 가 이미지를 내부적으로 정규화하기 때문이다. 그래서 평소에는
 * 세부가 살아 있는 **원본**을 쓰고, 이 상한은 아주 큰 파일에 대한 안전장치일 뿐이다.
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

/**
 * 이미지를 받아 인라인 파트로 만든다.
 *
 * **실패하면 null 이다 — 태깅을 막지 않는다.** 이미지를 못 받았다고 태그가 아예 안 달리면
 * 손해가 더 크다(이 파일의 기존 원칙: 실패를 삼키고 계속).
 *
 * 원본을 먼저 쓰고, 없거나 상한을 넘으면 썸네일로 내려간다.
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
      if (bytes.byteLength > MAX_IMAGE_BYTES) continue; // 다음 후보(썸네일)로
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

/** 본문 + 기존 태그목록으로 AI 태그를 추천받는다. 키 없음/에러 시 []. 절대 throw 안 함. */
export async function suggestTags(input: {
  title: string;
  htmlContent: string;
  /** 기존 태그와 사용 횟수 (#251). 많이 쓰인 것부터 실어 재사용을 돕는다. */
  allTags: { tag: string; count: number }[];
  userTags: string[];
  cap?: number;
  /** 글에 붙은 이미지 (#234). 제목·본문만으로는 안 나오는 태그가 여기서 나온다. */
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

  // 체인은 **실제로 받아 온** 이미지가 있을 때만 바꾼다 — 이미지를 못 받았으면
  // 텍스트 요청이므로 기존 체인이 맞다.
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
  input: {
    title: string;
    htmlContent: string;
    userTags: string[];
    /** 글에 붙은 이미지 (#234). */
    imageUrls?: { url?: string | null; thumbnailUrl?: string | null }[];
  },
): Promise<void> {
  try {
    if (!env.geminiApiKey) return;
    await connectToDB();
    // 사용 횟수까지 그대로 넘긴다 (#251) — 많이 쓰인 태그를 앞에 실어야 재사용이 는다.
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
