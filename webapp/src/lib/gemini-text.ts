import { GoogleGenAI } from '@google/genai';
import { env } from '@/lib/env';

/**
 * 제미니에게 글을 시키는 공용 호출 (#471).
 *
 * ── 왜 따로 두나 ─────────────────────────────────────────────────────
 *
 * 지금 제미니 호출이 파일마다 흩어져 있고(`suggest-tags`·`imageGen`·`painter`·`enji`)
 * **모델 차례가 두 군데 따로 적혀 있다.** 새 모델이 나올 때 한 곳만 고치면 나머지는
 * 조용히 옛 모델을 계속 쓴다.
 *
 * 이번엔 **글 쪽만** 여기로 모은다. 그림 생성은 파라미터가 딴판이라 억지로 합치지 않는다.
 */

/**
 * 글을 만들 때 쓰는 모델 차례. 앞엣것부터 써 보고 **일시적 오류면** 다음으로 넘어간다.
 *
 * 값이 잘못된 요청(400 류)에서는 다음 모델도 똑같이 실패하므로 넘기지 않는다 —
 * 헛되이 두 번 부르고 두 번 기다릴 뿐이다.
 */
export const TEXT_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'] as const;

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface AskOptions {
  signal?: AbortSignal;
  /** 넉넉히 잡되 한없이 쓰지는 않게. */
  maxOutputTokens?: number;
  /** 창작이라 기본값을 조금 높게 둔다. */
  temperature?: number;
  /** 자취에 남길 이름 — 어느 기능이 부른 것인지 로그에서 갈리게. */
  tag?: string;
}

/**
 * 잠깐 그런 것인가(다시 해 볼 만한가).
 *
 * 429(한도)·5xx·연결 오류는 다음 모델로 넘어가 볼 값어치가 있다. 키가 틀렸거나
 * 요청이 잘못된 것이면 **다음 모델도 똑같이 실패한다.**
 */
export function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b(429|5\d\d)\b/.test(msg)) return true;
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE|INTERNAL|timeout|ECONN|fetch failed/i.test(msg);
}

/**
 * 글을 받아 온다. 모든 모델이 실패하면 **던진다** — 부르는 쪽이 폴백을 정한다.
 *
 * `system` 메시지는 `systemInstruction` 으로, 나머지는 사용자 발화로 넘긴다.
 */
export async function askGemini(messages: ChatMessage[], opts: AskOptions = {}): Promise<string> {
  if (!env.geminiApiKey) throw new Error('GEMINI_API_KEY 가 없다');

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const user = messages
    .filter((m) => m.role !== 'system')
    .map((m) => m.content)
    .join('\n\n');
  if (!user.trim()) throw new Error('사용자 발화가 비었다');

  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  let lastError: unknown;

  for (const model of TEXT_MODELS) {
    if (opts.signal?.aborted) throw new Error('취소됨');
    try {
      const result = await ai.models.generateContent({
        model,
        config: {
          ...(system ? { systemInstruction: system } : {}),
          maxOutputTokens: opts.maxOutputTokens ?? 512,
          temperature: opts.temperature ?? 0.9,
          abortSignal: opts.signal,
        },
        contents: [{ role: 'user', parts: [{ text: user }] }],
      });
      const text = (result.text ?? '').trim();
      if (text) return text;
      lastError = new Error(`빈 답 — ${model}`);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[gemini-text${opts.tag ? `:${opts.tag}` : ''}] model=${model} 실패:`, msg.slice(0, 200));
      if (!isTransient(err)) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
