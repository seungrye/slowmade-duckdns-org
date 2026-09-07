import { GoogleGenAI } from '@google/genai';

/**
 * Pollinations FLUX understands Korean prompts poorly, so this translates once into English with Gemini before calling it.
 *
 * - `containsKorean`: true if there is even one Hangul syllable (가-힯).
 * - `translateToEnglish`: Korean input is translated by Gemini; English passes through.
 *
 * A failed translation (Gemini timeout, empty response, no key and so on) throws - the caller
 * (imageGen.translateAndGenerate) then falls back to sending the original prompt to Pollinations.
 */

export function containsKorean(text: string): boolean {
  return /[가-힯]/.test(text);
}

const TRANSLATE_SYSTEM_PROMPT = `You are a translator that converts Korean image generation prompts to English.
- Preserve style keywords (e.g., "pixel art", "16-bit RPG", "도트", "수채화").
- Keep technical details (sizes, ratios, "no characters").
- Translate poetically — capture mood, not just literal words.
- Return ONLY the translated prompt. No explanation, no quotes.`;

// A fast response matters (it sits in front of Pollinations). The RPD limit comes first - Gemma 4 (RPD 1,500 with
// unlimited TPM) is the main model and the newer Gemini is the fallback. (2.5 Flash's RPD of 20 is spent quickly in
// a batch, so it comes last.)
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
 * Cleans up the translation - Gemini sometimes adds quotes, whitespace or newlines.
 */
function sanitizeTranslation(raw: string): string {
  let s = raw.trim();
  // strip surrounding quotes (when a pair wraps it)
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
