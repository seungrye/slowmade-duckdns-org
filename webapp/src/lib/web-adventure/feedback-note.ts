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

// 프롬프트 예산: shim n_ctx(32k) 안에서 출력 여유를 남기려 로그를 대략 절삭.
// 한/영/코드 혼합 보수적으로 ~24000자까지만 로그에 할당(초과 시 앞뒤 보존 + 중략).
export const MAX_LOG_CHARS = 24000;
export const AUTHOR_NOTE_MARKER = '===작가노트===';

const ENDING_LABEL: Record<string, string> = {
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
    '이 로그를 바탕으로 두 가지를 한국어로 작성하라:',
    '1) 서사: 로그의 사실(선택·사건·결말)을 절대 바꾸지 말고, 빈약하게 지나간 장면은 감각·심리 묘사로 살을 붙이고, 이미 풍부한 장면은 최대한 보존하며, 하나의 매끄러운 단편 소설처럼 재구성한다. 어조·세계관 일관성 유지.',
    '2) 작가 노트: 이 플레이를 근거로 작가에게 줄 제안 — 안 가본 듯한 분기 아이디어, 더 깊게 팔 만한 캐릭터/떡밥, 빈약해 보완이 필요한 지점, 신규 시나리오 힌트.',
    '',
    '출력 형식(반드시 지켜라):',
    '첫 줄: 제목: <서사 제목>',
    '그 다음: 서사 본문',
    `그 다음 한 줄에 정확히: ${AUTHOR_NOTE_MARKER}`,
    '그 다음: 작가 노트',
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

/** LLM 원문 → { title, narrative, authorNote }. 순수 함수. 마커 없으면 전체를 서사로. */
export function parseOutput(text: string): FeedbackNoteResult {
  const raw = (text ?? '').trim();
  let title = '';
  let body = raw;

  const titleMatch = body.match(/^제목\s*[:：]\s*(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].trim();
    // 제목 라인 제거(첫 등장만).
    body = body.replace(titleMatch[0], '').trim();
  }

  const idx = body.indexOf(AUTHOR_NOTE_MARKER);
  if (idx === -1) {
    return { title, narrative: body.trim(), authorNote: '' };
  }
  const narrative = body.slice(0, idx).trim();
  const authorNote = body.slice(idx + AUTHOR_NOTE_MARKER.length).trim();
  return { title, narrative, authorNote };
}

/** 부수효과: 로컬 shim 에 chat/completions 호출 → 파싱된 결과. 실패 시 throw. */
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
      max_tokens: opts?.maxTokens ?? 1500,
      temperature: opts?.temperature ?? 0.9,
      stream: false,
    }),
    signal: opts?.signal,
  });
  if (!res.ok) {
    throw new Error(`shim ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 500));
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? '';
  if (!content.trim()) throw new Error('shim 응답이 비어 있습니다.');
  return parseOutput(content);
}
