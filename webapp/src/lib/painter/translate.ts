import { GoogleGenAI } from '@google/genai';

/**
 * Pollinations FLUX 가 한글 prompt 를 잘 못 이해하므로,
 * Gemini 로 한 번 영문 번역한 뒤 호출하기 위한 유틸.
 *
 * - `containsKorean` : 한글 음절 (가-힯) 한 글자라도 있으면 true.
 * - `translateToEnglish` : 한글 입력은 Gemini 로 번역, 영문은 그대로 통과.
 *
 * 번역 실패 (Gemini 타임아웃 / 빈 응답 / 키 없음 등) 시 throw — caller (imageGen.translateAndGenerate)
 * 가 fallback 으로 원본 prompt 를 그대로 Pollinations 에 보낸다.
 */

export function containsKorean(text: string): boolean {
  return /[가-힯]/.test(text);
}

const TRANSLATE_SYSTEM_PROMPT = `You are a translator that converts Korean image generation prompts to English.
- Preserve style keywords (e.g., "pixel art", "16-bit RPG", "도트", "수채화").
- Keep technical details (sizes, ratios, "no characters").
- Translate poetically — capture mood, not just literal words.
- Return ONLY the translated prompt. No explanation, no quotes.`;

// 빠른 응답이 중요 (Pollinations 앞단). RPD 한도 우선 — Gemma 4(RPD 1,500 +
// TPM 무제한)를 메인으로, 신세대 Gemini 를 폴백으로. (2.5 Flash 는 RPD 20 으로
// 배치에서 금방 소진되어 최후순위.)
const TRANSLATE_MODEL_CHAIN = [
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|HEADERS_TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND)\b/i.test(msg);
}

/**
 * 번역 결과 정제 — Gemini 가 가끔 따옴표/공백/개행을 덧붙임.
 */
function sanitizeTranslation(raw: string): string {
  let s = raw.trim();
  // 양 끝 따옴표 제거 (한 쌍이 감싸는 경우)
  if (s.length >= 2) {
    const first = s.charAt(0);
    const last = s.charAt(s.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

export async function translateToEnglish(prompt: string, geminiKey: string): Promise<string> {
  if (!containsKorean(prompt)) return prompt;
  if (!geminiKey) {
    throw new Error('Gemini API key is empty — cannot translate');
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  let lastError: unknown;
  for (const model of TRANSLATE_MODEL_CHAIN) {
    try {
      const result = await ai.models.generateContent({
        model,
        config: { systemInstruction: TRANSLATE_SYSTEM_PROMPT },
        contents: prompt,
      });
      const text = sanitizeTranslation(result.text ?? '');
      if (!text) {
        lastError = new Error(`Empty translation from model ${model}`);
        continue;
      }
      return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[painter-translate] model=${model} failed:`, msg.slice(0, 200));
      if (!isTransientGeminiError(err)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
