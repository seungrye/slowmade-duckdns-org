/**
 * 타로 오늘의 풀이 생성 — 로컬 LLM + 존댓말 가드 + 템플릿 폴백 (#388).
 *
 * 실측(3장) 결과 로컬 Qwen 의 내용·뉘앙스는 양호했지만 **존댓말/반말 편차**가 있었다
 * (존댓말로 시켰는데 한 장이 반말로 샜다). 그래서:
 *   1. buildPrompt 가 존댓말을 예시까지 넣어 강하게 요구하고,
 *   2. isPolite 가 결과를 검사해 반말이면 배치가 1회 재생성,
 *   3. 그래도 실패하면 templateReading(항상 존댓말)으로 떨어진다.
 *
 * LLM 호출은 web-adventure 피드백 노트와 같은 스트리밍 방식이다(sseDeltaContent 재사용).
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

/** 프롬프트 조립(순수). 존댓말을 예시까지 넣어 강제한다. */
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
 * 반말/존댓말 가드(순수). 모든 문장이 존댓말 어미로 끝나야 통과.
 *
 * 한 문장이라도 반말로 새면 실패시켜 재생성을 유도한다 — 존댓말/반말이 섞인 글은
 * 완성도가 떨어져 보인다. 완벽한 형태소 분석이 아니라 어미 검사지만, 배치 재생성 1회로
 * 대부분 흡수되고 남으면 템플릿으로 떨어지므로 실해가 없다.
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

/** LLM 실패·미생성 시의 폴백 글(항상 존댓말). 카드 키워드를 담는다. */
export function templateReading(card: TarotCard, orientation: Orientation): string {
  const kws = keywordsOf(card, orientation);
  const lead = kws[0] ?? "고요함";
  const sub = kws[1] ?? lead;
  if (orientation === "up") {
    return `오늘은 ${lead}의 기운이 감도는 하루예요. ${sub}, 그 마음을 믿고 한 걸음 내디뎌 보세요. 작은 시도 하나가 뜻밖의 흐름을 열어 줄 거예요.`;
  }
  return `오늘은 ${lead}이 마음에 스치는 날이에요. 서두르기보다 한 박자 쉬어 가 보세요. 무리하지 않아도 괜찮으니, 스스로를 다정하게 대해 주세요.`;
}

// 로컬 shim 은 생성이 느려(장당 ~30초) 여유 있게 잡는다. 밤 배치라 길어도 무방.
const dispatcher = new Agent({ headersTimeout: 200_000, bodyTimeout: 200_000 });

async function callLocalLlm(messages: LlmMessage[], signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${env.llmBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "Qwen3-30B-A3B-Q4_K_M",
      messages,
      max_tokens: 240,
      // 창작이라 다양성은 두되(shim 이 temp 0.9 고정), think 는 꺼 직답을 받는다.
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
 * 프롬프트로 존댓말 풀이 생성(범용) — LLM → 존댓말 검사 → 실패 시 재생성 1회 → 그래도 실패면
 * fallback(항상 존댓말 템플릿). 타로·사주가 공유한다. 어떤 경우에도 존댓말 결과를 돌려준다.
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
      break; // 네트워크·shim 오류 — 폴백으로 간다.
    }
  }
  return { reading: fallback, source: "template" };
}

/** 타로 오늘의 풀이 생성. */
export async function generateReading(
  card: TarotCard,
  orientation: Orientation,
  opts?: { signal?: AbortSignal; retries?: number },
): Promise<GeneratedReading> {
  return generatePolite(buildPrompt(card, orientation), templateReading(card, orientation), opts);
}
