/**
 * 타로 오늘의 풀이 생성 — 제미니 + 존댓말 가드 + 템플릿 폴백 (#388, #471).
 *
 * ── 왜 제미니인가 ────────────────────────────────────────────────────
 *
 * 전에는 로컬 Qwen(shim)을 썼다. 내용·뉘앙스는 양호했지만 **존댓말/반말 편차**가 있었고
 * (존댓말로 시켰는데 한 장이 반말로 샜다) 장당 ~30초라 타임아웃을 200초로 잡아야 했다.
 *
 * 타로·사주는 **밖에 물어도 되는 것**이다 — 보내는 것이 뽑힌 카드와 방향, 계산으로 나온
 * 사주 기둥뿐이고 노트 본문 같은 개인 내용은 안 나간다.
 *
 * ── 겹겹이는 그대로 둔다 ─────────────────────────────────────────────
 *
 *   1. buildPrompt 가 존댓말을 예시까지 넣어 강하게 요구하고,
 *   2. isPolite 가 결과를 검사해 반말이면 1회 재생성,
 *   3. 그래도 안 되면 templateReading(항상 존댓말)으로 떨어진다.
 *
 * 제미니는 지시를 훨씬 잘 따르지만, **폴백은 모델 품질이 아니라 API 가 죽었을 때**를
 * 위한 것이다. 없애면 장애 나는 날 빈 풀이가 나간다.
 */
import { askGemini } from "@/lib/gemini-text";
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
      const out = await askGemini(messages, { signal: opts?.signal, maxOutputTokens: 400, tag: "fortune" });
      if (out && isPolite(out)) return { reading: out, source: "llm" };
      // 반말이 새면 재시도 — 창작이라 온도가 있어 다음엔 존댓말일 확률이 높다.
    } catch {
      break; // 네트워크·제미니 오류 — 폴백으로 간다.
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
