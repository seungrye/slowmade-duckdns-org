// 피드백 노트 생성 — 플레이 회차 로그를 로컬 LLM(shim)에 넣어 살 붙인 서사 + 작가 노트 생성. (#9)
//
// 프롬프트 조립(buildMessages)·출력 파싱(parseOutput)은 순수 함수(단위 테스트 용이).
// generateFeedbackNote 만 부수효과(로컬 shim fetch). site 백엔드가 127.0.0.1 로 내부 호출.

import { env } from '@/lib/env';

export interface FeedbackNoteInput {
  endingId: string;
  finalSceneId: string;
  scenePath: string[];
  log: string[];
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

// 프롬프트 예산: shim n_ctx(32k) 안에서 출력(4000토큰) 여유를 남기려 로그를 대략 절삭.
// ~32000자까지 로그에 할당(초과 시 앞뒤 보존 + 중략). 입력+출력이 n_ctx 를 넘으면
// shim 이 n_predict 를 자동 클램프하므로 크래시 없이 graceful 하게 줄어든다.
export const MAX_LOG_CHARS = 32000;

export const ENDING_LABEL: Record<string, string> = {
  ascension: '승천',
  revolution: '혁명',
  harmony: '조화',
  fall: '몰락',
  petrification: '석화',
  sylvan_bond: '숲의 유대',
};

/** 로그 문자열 배열을 예산 안으로 절삭. 초과 시 앞 60% + 뒤 40% 를 남기고 중략 표시. */
export function truncateLog(log: string[], maxChars = MAX_LOG_CHARS): string {
  const joined = log.join('\n');
  if (joined.length <= maxChars) return joined;
  const headLen = Math.floor(maxChars * 0.6);
  const tailLen = maxChars - headLen;
  const head = joined.slice(0, headLen);
  const tail = joined.slice(joined.length - tailLen);
  return `${head}\n\n…(중략: 긴 여정이라 중간 일부 생략)…\n\n${tail}`;
}

/** 회차 입력 → LLM chat messages (system + user). 순수 함수. */
export function buildMessages(input: FeedbackNoteInput): Array<{ role: string; content: string }> {
  const endingLabel = ENDING_LABEL[input.endingId] ?? input.endingId;
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
    '이 플레이를 근거로 작가에게 줄 **제안과 개선안만** 한국어 마크다운으로 작성하라.',
    '절대 이야기(서사)를 다시 쓰지 마라. 소설/장면 산문을 쓰지 마라 — 오직 제안·개선안.',
    '"제목:" 이나 "**서사:**" 같은 머리말을 쓰지 마라. 장면 묘사·대사·주사위 판정을 재현하지 마라.',
    '',
    '출력은 반드시 아래 소제목(## 로 시작)으로만 구성하고, 각 항목은 마크다운 목록으로 쓴다.',
    '첫 줄은 반드시 "## 안 가본 듯한 분기 아이디어" 로 시작한다.',
    '## 안 가본 듯한 분기 아이디어',
    '## 더 깊게 팔 만한 캐릭터/떡밥',
    '## 빈약해 보완이 필요한 지점',
    '## 신규 시나리오 힌트',
    '',
    '이 형식을 벗어난 응답(특히 서사 산문)은 폐기되고 다시 생성된다.',
  ].join('\n');

  const user = [
    `엔딩: ${endingLabel} (${input.endingId})`,
    charLine ? `캐릭터: ${charLine}` : '',
    input.scenePath.length ? `씬 경로(${input.scenePath.length}): ${input.scenePath.join(' → ')}` : '',
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

/** 요구한 소제목의 핵심어 — LLM 이 표기를 조금 바꿔도(##/###, 어미 변형) 잡히도록 느슨하게 본다. */
const PROPOSAL_HEADING_KEYS = ['분기', '캐릭터', '떡밥', '보완', '시나리오 힌트'];

/**
 * 응답이 '제안·개선안' 형식인가(순수).
 *
 * LLM 이 "서사를 다시 쓰지 마라" 지시를 어기고 산문을 써낸 적이 있는데, 검증이 없어
 * 그대로 작가 노트로 저장됐다. 소제목이 하나도 없으면 형식 위반으로 보고 거부한다.
 */
export function looksLikeProposal(content: string): boolean {
  const text = String(content ?? '');
  if (!text.trim()) return false;
  return text
    .split('\n')
    .filter((line) => /^\s{0,3}#{2,4}\s/.test(line))
    .some((heading) => PROPOSAL_HEADING_KEYS.some((key) => heading.includes(key)));
}

/** SSE 'data: {...}' 한 줄에서 delta.content 추출(순수). data/[DONE]/파싱실패면 ''. */
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

/** 부수효과: 로컬 shim 에 chat/completions 호출 → 파싱된 결과. 실패 시 throw.
 *
 * **반드시 스트리밍(stream:true)** 으로 호출한다: 생성이 수십 분이라 non-stream 이면 shim 이
 * 그동안 응답 헤더를 안 보내 Node fetch(undici) 의 기본 headersTimeout(~5분)에 걸려
 * 'fetch failed' 로 abort 된다(#21 재발). 토큰을 계속 흘려보내면 헤더·바디 타임아웃이 리셋된다.
 */
export async function generateFeedbackNote(
  input: FeedbackNoteInput,
  opts?: { model?: string; maxTokens?: number; temperature?: number; signal?: AbortSignal },
): Promise<FeedbackNoteResult> {
  const model = opts?.model ?? 'Qwen3-30B-A3B-Q4_K_M';
  const res = await fetch(`${env.llmBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: buildMessages(input),
      max_tokens: opts?.maxTokens ?? 4000,
      temperature: opts?.temperature ?? 0.9,
      stream: true,
    }),
    signal: opts?.signal,
  });
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
  content += sseDeltaContent(buf); // 마지막 개행 없는 잔여

  if (!content.trim()) throw new Error('shim 응답이 비어 있습니다.');
  // 형식 위반(서사 산문)은 저장하지 않고 던진다 — 워커가 queued 로 되돌려 재시도한다.
  // 검증이 없던 탓에 다른 회차의 서사가 작가 노트로 저장된 적이 있다.
  if (!looksLikeProposal(content)) {
    throw new Error(
      `LLM 이 제안 형식을 따르지 않음(서사 재작성 추정) — 앞부분: ${content.trim().slice(0, 80)}`,
    );
  }
  // AI 는 제안/개선안(작가 노트)만 생성한다. 서사·제목은 워커가 원본 로그·엔딩으로 채운다
  //   (서사 재작성은 잘림·시간 낭비라 제거 — 엔딩 원본 로그를 그대로 서사로 쓴다).
  return { title: '', narrative: '', authorNote: content.trim() };
}
