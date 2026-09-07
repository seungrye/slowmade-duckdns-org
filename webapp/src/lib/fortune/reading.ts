/**
 * Generating the day's tarot reading - the local LLM plus a politeness guard and a template fallback (#388).
 *
 * Measured over three cards, the local Qwen's content and nuance were fine but **its politeness level wavered**
 * (told to be polite, one card came back casual). So:
 *   1. buildPrompt demands polite speech firmly, with examples,
 *   2. isPolite checks the result and, if it is casual, the batch regenerates once,
 *   3. and failing that it falls back to templateReading (always polite).
 *
 * The LLM call streams the same way as the web-adventure feedback notes (reusing sseDeltaContent).
 */
import { Agent } from "undici";
import { env } from "@/lib/env";
import { sseDeltaContent } from "@/lib/web-adventure/feedback-note";
import { keywordsOf, type Orientation, type TarotCard } from "./tarot-deck";

export type ReadingSource = "llm" | "template";

export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

/** Assembles the prompt (pure). It enforces polite speech, with examples. */
export function buildPrompt(card: TarotCard, orientation: Orientation): LlmMessage[] {
  const dir = orientation === "up" ? "정방향" : "역방향";
  const kws = keywordsOf(card, orientation).join(", ");
  const system =
    "너는 따뜻하고 담백한 문장을 쓰는 타로 리더야. 아래 카드로 '오늘의 운세'를 한국어로 써 줘.\n" +
    "반드시 지킬 것:\n" +
    "- 3~4문장. 모든 문장을 반드시 **존댓말(~요 / ~습니다)** 로 끝맺어. 반말(~어/~야/~해/~줘/~거야)은 절대 쓰지 마.\n" +
    "- 위로 한 마디와 오늘 실천할 작은 조언 하나를 담아.\n" +
    "- 카드 이름 자체는 반복하지 말고, 미신적 단정(반드시 ~한다)은 피해.\n" +
    "문체 예시: \"오늘은 마음이 차분해지는 하루예요. 서두르기보다 한 박자 쉬어 가 보세요. 작은 정리 하나가 뜻밖의 여유를 선물할 거예요.\"";
  const user = `카드: ${card.nameKr} (${card.nameEn}) · ${dir}\n핵심어: ${kws}\n오늘도 좋은 하루가 되길 바라며 써 줘.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * The politeness guard (pure). It passes only when every sentence ends politely.
 *
 * One casual sentence fails it and prompts a regeneration - a mix of polite and casual reads as unfinished. It checks
 * endings rather than doing real morphological analysis, but one batch regeneration absorbs most of it and the rest
 * falls back to the template, so nothing is lost.
 */
export function isPolite(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  const sentences = t.split(/[.!?。\n]+/).map((s) => s.trim()).filter(Boolean);
  if (!sentences.length) return false;
  const polite = /(?:요|죠|니다|십시오)$/;
  return sentences.every((s) => {
    const clean = s
      .replace(/["'”’」』)\]]+$/u, "")
      .replace(/[~…\-\s]+$/u, "")
      .trim();
    return polite.test(clean);
  });
}

/** The fallback text when the LLM fails or has not run (always polite). It carries the card's keywords. */
export function templateReading(card: TarotCard, orientation: Orientation): string {
  const kws = keywordsOf(card, orientation);
  const lead = kws[0] ?? "고요함";
  const sub = kws[1] ?? lead;
  if (orientation === "up") {
    return `오늘은 ${lead}의 기운이 감도는 하루예요. ${sub}, 그 마음을 믿고 한 걸음 내디뎌 보세요. 작은 시도 하나가 뜻밖의 흐름을 열어 줄 거예요.`;
  }
  return `오늘은 ${lead}이 마음에 스치는 날이에요. 서두르기보다 한 박자 쉬어 가 보세요. 무리하지 않아도 괜찮으니, 스스로를 다정하게 대해 주세요.`;
}

// The local shim generates slowly (about 30 seconds a card), so the timeout is generous. Being a nightly batch, length is fine.
const dispatcher = new Agent({ headersTimeout: 200_000, bodyTimeout: 200_000 });

async function callLocalLlm(messages: LlmMessage[], signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${env.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "Qwen3-30B-A3B-Q4_K_M",
      messages,
      max_tokens: 240,
      // It is creative writing, so variety is kept (the shim pins temp at 0.9) while think is off for a direct answer.
      think: false,
      stream: true,
    }),
    signal,
    dispatcher,
  } as RequestInit & { dispatcher?: unknown });
  if (!res.ok) throw new Error(`shim ${res.status}`);
  if (!res.body) throw new Error("shim 응답 본문 없음");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      content += sseDeltaContent(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  content += sseDeltaContent(buf);
  return content.trim();
}

export interface GeneratedReading {
  reading: string;
  source: ReadingSource;
}

/**
 * Generates a polite reading from a prompt (general purpose) - LLM, politeness check, one regeneration on failure,
 * then the fallback (an always-polite template). Shared by tarot and saju. It returns a polite result in every case.
 */
export async function generatePolite(
  messages: LlmMessage[],
  fallback: string,
  opts?: { signal?: AbortSignal; retries?: number },
): Promise<GeneratedReading> {
  const attempts = (opts?.retries ?? 1) + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const out = await callLocalLlm(messages, opts?.signal);
      if (out && isPolite(out)) return { reading: out, source: "llm" };
      // 반말이 새면 재시도(shim temp 0.9 라 다음엔 존댓말일 확률이 높다).
    } catch {
      break; // A network or shim error - fall through to the fallback.
    }
  }
  return { reading: fallback, source: "template" };
}

/** Generates the day's tarot reading. */
export async function generateReading(
  card: TarotCard,
  orientation: Orientation,
  opts?: { signal?: AbortSignal; retries?: number },
): Promise<GeneratedReading> {
  return generatePolite(buildPrompt(card, orientation), templateReading(card, orientation), opts);
}
