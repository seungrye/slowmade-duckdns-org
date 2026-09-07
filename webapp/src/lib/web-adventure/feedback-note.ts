// Feedback-note generation - a play run's log goes to the local LLM (the shim) to produce a fleshed-out narrative plus an author's note. (#9)
//
// Assembling the prompt (buildMessages) and parsing the output (parseOutput) are pure functions (easy to unit test).
// Only generateFeedbackNote has side effects (fetching the local shim). The site backend calls it internally over 127.0.0.1.

import { randomUUID } from 'node:crypto';

import { env } from '@/lib/env';
import { Agent } from 'undici';
import { GEN_TIMEOUT_MS } from './feedback-worker-timing';

export interface FeedbackNoteInput {
  endingId: string;
  finalSceneId: string;
  scenePath: string[];
  log: string[];
  /**
   * The full scene list (id and title) (#163). When present it is put in the user message to say **what has already been written**.
   *
   * Absent, it behaves as before - the model writes from the log alone.
   */
  sceneIndex?: Array<{ id: string; title?: string }>;
  character?: {
    protagonist?: string;
    ability?: string;
    stigmaErosion?: number;
    hp?: number;
    maxHp?: number;
    inventory?: string[];
  } | null;
}

export interface FeedbackNoteResult {
  title: string;
  narrative: string;
  authorNote: string;
}

// The prompt budget: the log is trimmed roughly to leave room for the output (4000 tokens) inside the shim's n_ctx (32k).
// Up to ~32000 characters are allocated to the log (beyond that, the head and tail are kept with an elision). If input
// plus output exceeds n_ctx, the shim clamps n_predict automatically, so it degrades gracefully rather than crashing.
export const MAX_LOG_CHARS = 32000;

// The endings' short names live in content, which is the source (#352). The copy that used to be here was removed.
export { ENDING_LABEL, endingLabel } from '@/content/web-adventure/endings';
import { endingLabel } from '@/content/web-adventure/endings';

/** Trims the log string array into the budget. Over it, the leading 60% and trailing 40% are kept with an elision marker. */
export function truncateLog(log: string[], maxChars = MAX_LOG_CHARS): string {
  const joined = log.join('\n');
  if (joined.length <= maxChars) return joined;
  const headLen = Math.floor(maxChars * 0.6);
  const tailLen = maxChars - headLen;
  const head = joined.slice(0, headLen);
  const tail = joined.slice(joined.length - tailLen);
  return `${head}\n\n…(중략: 긴 여정이라 중간 일부 생략)…\n\n${tail}`;
}

/** A run's input -> the LLM chat messages (system plus user). A pure function. */
export function buildMessages(
  input: FeedbackNoteInput,
  opts: { echoToken?: string } = {},
): Array<{ role: string; content: string }> {
  const label = endingLabel(input.endingId);
  const c = input.character ?? {};
  const charLine = [
    c.protagonist ? `주인공: ${c.protagonist}` : null,
    c.ability ? `능력: ${c.ability}` : null,
    typeof c.stigmaErosion === 'number' ? `성흔 침식도: ${c.stigmaErosion}` : null,
    typeof c.hp === 'number' ? `HP: ${c.hp}${c.maxHp ? `/${c.maxHp}` : ''}` : null,
    c.inventory && c.inventory.length ? `소지품: ${c.inventory.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const system = [
    '너는 인터랙티브 픽션 「에테르니아」의 시나리오를 다듬는 창작 보조 편집자다.',
    '입력으로 한 플레이어의 실제 플레이 진행 로그(선택·장면 본문·판정 결과)가 주어진다.',
    // #163 - without this one line, it declared scenes that run had not passed "absent or thin".
    //   The "dawn where three moons overlap" seed is actually paid off across 6 scenes, and the note still said it was lacking.
    '**너는 전체 이야기 중 이 회차가 지난 한 경로만 본다.** 보지 못한 장면이 훨씬 많다.',
    '로그에 없다는 이유로 "없다·부족하다·회수되지 않았다" 라고 단정하지 마라.',
    '그런 지적을 하려면 "이 경로에서는 …가 드러나지 않았다" 처럼 **경로를 한정해서** 쓴다.',
    '이 플레이를 근거로 작가에게 줄 **제안과 개선안만** 한국어 마크다운으로 작성하라.',
    '절대 이야기(서사)를 다시 쓰지 마라. 소설/장면 산문을 쓰지 마라 — 오직 제안·개선안.',
    '"제목:" 이나 "**서사:**" 같은 머리말을 쓰지 마라. 장면 묘사·대사·주사위 판정을 재현하지 마라.',
    '',
    // For detecting misdelivery - it checks the response belongs to this request (#65). With no token, no instruction is given.
    ...(opts.echoToken
      ? [`출력의 맨 첫 줄에는 정확히 [[NOTE:${opts.echoToken}]] 만 쓰고 줄을 바꾼다.`]
      : []),
    '출력은 반드시 아래 소제목(## 로 시작)으로만 구성하고, 각 항목은 마크다운 목록으로 쓴다.',
    opts.echoToken
      ? '토큰 줄 다음 줄은 반드시 "## 안 가본 듯한 분기 아이디어" 로 시작한다.'
      : '첫 줄은 반드시 "## 안 가본 듯한 분기 아이디어" 로 시작한다.',
    '## 안 가본 듯한 분기 아이디어',
    '## 더 깊게 팔 만한 캐릭터/떡밥',
    '## 빈약해 보완이 필요한 지점',
    '## 신규 시나리오 힌트',
    '',
    '이 형식을 벗어난 응답(특히 서사 산문)은 폐기되고 다시 생성된다.',
  ].join('\n');

  // The full scene list - knowing what is already written lets it say "the connection is weak" instead of "it is absent".
  // Only the titles are included, so it is not long, and it is trimmed if it still overflows (protecting the prompt budget).
  const sceneIndexLine = (() => {
    const idx = input.sceneIndex ?? [];
    if (idx.length === 0) return '';
    const lines = idx.map((s) => `${s.id}${s.title ? ` — ${s.title}` : ''}`);
    let out = lines.join('\n');
    if (out.length > 8000) out = out.slice(0, 8000) + '\n…(이하 생략)';
    return `── 전체 씬 목록(제목만) ──\n${out}`;
  })();

  const user = [
    `엔딩: ${label} (${input.endingId})`,
    charLine ? `캐릭터: ${charLine}` : '',
    input.scenePath.length ? `씬 경로(${input.scenePath.length}): ${input.scenePath.join(' → ')}` : '',
    '',
    sceneIndexLine,
    '',
    '── 플레이 진행 로그 ──',
    truncateLog(input.log),
  ]
    .filter((s) => s !== '')
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** The echo token carried on the response's first line. null when absent (the model may omit it). */
export function extractEchoToken(content: string): string | null {
  const m = String(content ?? '').match(/^\s*\[\[NOTE:([A-Za-z0-9_-]{4,64})\]\]/);
  return m ? m[1] : null;
}

/** Strips the token line before saving. Without a token, the text is unchanged. */
export function stripEchoToken(content: string): string {
  const text = String(content ?? '');
  return extractEchoToken(text)
    ? text.replace(/^\s*\[\[NOTE:[A-Za-z0-9_-]{4,64}\]\][^\n]*\n?/, '')
    : text;
}

/** The keywords of the required subheadings - matched loosely so a slight change of notation (##/###, a different ending) still hits. */
const PROPOSAL_HEADING_KEYS = ['분기', '캐릭터', '떡밥', '보완', '시나리오 힌트'];

/**
 * Whether the response is in the 'suggestions and improvements' format (pure).
 *
 * The LLM has broken the "do not rewrite the narrative" instruction and written prose, and with no validation that
 * was saved straight into the author's note. Not one subheading counts as a format violation and is rejected.
 */
export function looksLikeProposal(content: string): boolean {
  const text = String(content ?? '');
  if (!text.trim()) return false;
  return text
    .split('\n')
    .filter((line) => /^\s{0,3}#{2,4}\s/.test(line))
    .some((heading) => PROPOSAL_HEADING_KEYS.some((key) => heading.includes(key)));
}

/** Extracts delta.content from one SSE 'data: {...}' line (pure). '' for non-data, [DONE] or a parse failure. */
export function sseDeltaContent(line: string): string {
  const t = line.trim();
  if (!t.startsWith('data:')) return '';
  const data = t.slice(5).trim();
  if (!data || data === '[DONE]') return '';
  try {
    const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
    return j?.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}

/** A side effect: calls the local shim's chat/completions -> the parsed result. Throws on failure.
 *
 * **It must be called with streaming (stream:true)**: generation takes tens of minutes, and without streaming the
 * shim sends no response header in the meantime, so Node's fetch (undici) hits its default headersTimeout (~5 minutes)
 * and aborts with 'fetch failed' (#21 recurring). Keeping tokens flowing resets both the header and body timeouts.
 */
// #102 - Node's built-in fetch (undici) cuts it off first with its default body and header timeouts (5 minutes each).
//   The worker intends 45 minutes through an AbortSignal, but it actually died at around 10 minutes with "terminated"
//   (the 2026-08-12 incident). A local LLM takes minutes just to process the prompt, so they are raised explicitly.
//   The same limit is given to both the header (the first response) and the body (the gap between chunks) - so neither being slow kills it.
const llmDispatcher = new Agent({
  headersTimeout: GEN_TIMEOUT_MS,
  bodyTimeout: GEN_TIMEOUT_MS,
});

export async function generateFeedbackNote(
  input: FeedbackNoteInput,
  opts?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
    echoToken?: string; // injected to pin it in tests (#65)
  },
): Promise<FeedbackNoteResult> {
  const model = opts?.model ?? 'Qwen3-30B-A3B-Q4_K_M';
  // The misdelivery-detection token - the shim once returned the previous request's response (#65).
  const echoToken = opts?.echoToken ?? randomUUID().replace(/-/g, '').slice(0, 12);
  const res = await fetch(`${env.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: buildMessages(input, { echoToken }),
      max_tokens: opts?.maxTokens ?? 4000,
      temperature: opts?.temperature ?? 0.9,
      stream: true,
    }),
    signal: opts?.signal,
    // dispatcher is not in the standard RequestInit, but Node (undici) accepts it.
    dispatcher: llmDispatcher,
  } as RequestInit & { dispatcher?: unknown });
  if (!res.ok) {
    throw new Error(`shim ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 500));
  }
  if (!res.body) throw new Error('shim 응답 본문 없음');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      content += sseDeltaContent(line);
    }
  }
  content += sseDeltaContent(buf); // the remainder with no trailing newline

  if (!content.trim()) throw new Error('shim 응답이 비어 있습니다.');

  // Another request's response came through - a token differing from this request's means it is not saved (#65).
  // If the model omitted the token (null) it passes, so no false positives are created.
  const echoed = extractEchoToken(content);
  if (echoed && echoed !== echoToken) {
    throw new Error(`응답 토큰 불일치 — 다른 요청의 응답으로 보임(기대 ${echoToken} / 받음 ${echoed})`);
  }
  content = stripEchoToken(content);

  // A format violation (narrative prose) is thrown rather than saved - the worker returns it to queued and retries.
  // Without that validation, another run's narrative was once saved as the author's note.
  if (!looksLikeProposal(content)) {
    throw new Error(
      `LLM 이 제안 형식을 따르지 않음(서사 재작성 추정) — 앞부분: ${content.trim().slice(0, 80)}`,
    );
  }
  // The AI writes only the suggestions and improvements (the author's note). The worker fills the narrative and title
  //   from the original log and ending (rewriting the narrative was removed as truncation-prone and a waste of time - the ending's original log is used as the narrative).
  return { title: '', narrative: '', authorNote: content.trim() };
}
