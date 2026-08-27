// 막혔을 때 무엇을 남기나 (#282, #283).
//
// ── 왜 꺼냈나 ───────────────────────────────────────────────────────────
//
// 파이프라인의 실패 쪽 분기는 **한 번도 실행된 적이 없었다**(#282). 모순을 스펙에 심어
// 유도해 봤지만 테스트를 쓰는 것이 클로드라 **클로드가 테스트 단계에서 이미 한쪽으로
// 정해 버렸다** — 코더가 받은 테스트에는 모순이 없었고, 그래서 실패 분기에 닿지 못했다.
//
// 닿지 못하는 진짜 이유는 그 분기들이 **부수효과(git·gh·에이전트) 한가운데 인라인으로**
// 박혀 있어서다. 판정과 문구를 꺼내 두면 네트워크·파일 없이 시험할 수 있다. 이 저장소에서
// 테스트 변조 금지가 서로 다른 이유로 세 번 뚫렸고(#275 #277 #279) 매번 재현해서야 잡혔다 —
// **미실행 코드는 작동한다는 근거가 없다.**
//
// ── 왜 한 곳인가 ───────────────────────────────────────────────────────
//
// "막히면 브랜치를 올리고 이슈를 만들고 스레드에 알린다" 가 **12회 소진 경로에만** 붙어
// 있었다. 에이전트 호출 자체가 실패하면 `die()` 로 즉시 끝나 아무것도 안 남는다(#283).
// 코더 모델이 은퇴해 404 를 돌려주는 동안 야간 러너는 매일 밤 1회차에서 죽었고, 아침에
// 사람이 볼 수 있는 흔적은 systemd 로그뿐이었다. 문구를 여기 모아 두면 두 경로가 같은
// 것을 부른다.
//
// 스크립트(node)와 테스트(vitest)가 같은 파일을 쓴다. 두 벌로 두면 한쪽만 고쳐지는 날이 온다.

/** 어디서 막혔나. */
export const StuckKind = Object.freeze({
  /** 에이전트 호출 자체가 실패했다 — 회차를 쓴 적이 없다 (#283). */
  AGENT_FAILED: 'AGENT_FAILED',

  /** 논의 회차를 다 썼는데 초록에 못 갔다. */
  ROUNDS_EXHAUSTED: 'ROUNDS_EXHAUSTED',
});

/** 이슈 제목에 실을 스펙 첫 줄 길이. */
const TITLE_CHARS = 60;
/** 이슈 본문에 실을 스펙 줄 수 — 이슈가 스펙 전문이 되면 읽히지 않는다. */
const SPEC_LINES = 12;
/** 이슈 본문에 실을 실패 출력 길이(뒤에서부터). */
const BODY_OUTPUT_CHARS = 2000;
/** 덧글에 실을 실패 출력 길이 — 덧글은 5000자 상한이 있다(`comment/route.ts:26`). */
const COMMENT_OUTPUT_CHARS = 1200;

const 뒤에서 = (s, n) => (s ?? '').slice(-n);
const 첫줄 = (spec) => (spec ?? '').split('\n')[0].replace(/^#+\s*/, '').trim();

/**
 * 되돌릴 **계획**만 낸다 — 실행하지 않는다.
 *
 * 파일을 직접 쓰면 이 규칙을 파일 없이 시험할 수 없다. `{ path, content }` 면 그 내용으로
 * 쓰고, `content` 가 `null` 이면 지운다.
 *
 * `changedBetween`(snapshot.mjs)을 쓰지 않는 이유: 그건 after 만 훑어서 **지워진 것을
 * 못 본다.** 되돌리기에서는 그게 구멍이다 — 클로드가 구현 파일을 지워 버리면 계획이
 * 하나도 안 나온다.
 *
 * @param {Map<string,string>} before 클로드 턴 **전**의 내용
 * @param {Map<string,string>} after  턴 **후**의 내용
 * @returns {{path: string, content: string|null}[]} 경로 순
 */
export function revertPlan(before, after) {
  const plan = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const 전 = before.get(path);
    const 후 = after.get(path);
    if (전 === 후) continue;
    plan.push({ path, content: before.has(path) ? 전 : null });
  }
  // 경로 순으로 고정한다 — Set 순서를 그대로 흘리면 로그가 실행마다 달라진다.
  return plan.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 클로드가 테스트를 고쳤나 — 고쳤으면 그 시점을 새 기준으로 삼아야 한다.
 *
 * 새 기준을 안 잡으면 다음 회차에 그 수정이 "코더가 만진 것" 으로 잡혀 되돌아간다.
 * 지운 것도 바뀐 것으로 센다.
 */
export function needsRebaseline(before, after) {
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(path) !== after.get(path)) return true;
  }
  return false;
}

/** 이슈 제목 — 12회를 다 쓴 것(미완)과 에이전트가 죽은 것(중단)을 구분한다. */
export function stuckTitle(kind, spec) {
  const 말머리 = kind === StuckKind.AGENT_FAILED ? 'pipeline 중단' : 'pipeline 미완';
  return `${말머리}: ${첫줄(spec).slice(0, TITLE_CHARS) || '(제목 없음)'}`;
}

/**
 * 이슈 본문 — **목적·목표·진행·현재 상황.** 나중에 이어받을 사람이 읽는다.
 *
 * 잰 것이 하나도 없어도(에이전트가 1회차에서 죽은 경우) 본문이 나와야 한다. 예전 코드는
 * `red.counts.numTotalTests` 를 그대로 읽어 **바로 그 자리에서 다시 터졌다**.
 */
export function stuckIssueBody(info) {
  const {
    kind, spec, branch, worktree, who,
    testFiles = [], redCount = null, round = 0, maxRounds = 0, verdict = null, output = '',
  } = info;

  const 진행 = kind === StuckKind.AGENT_FAILED
    ? [
      `- ${who ?? '에이전트'} 실행이 실패해 ${round}회차에서 멈췄습니다.`,
      '- 회차를 쓴 것이 아니라 **호출 자체가 실패**했습니다 — 모델·자격증명·네트워크를 먼저 보세요.',
    ]
    : [
      `- 구현을 ${maxRounds}회 고쳤지만 초록에 못 갔습니다 (${verdict ?? '판정 없음'}).`,
      `- 마지막은 ${round}회차입니다.`,
    ];

  return [
    '## 목적', (spec ?? '').split('\n').slice(0, SPEC_LINES).join('\n'), '',
    '## 목표',
    testFiles.length
      ? `아래 테스트가 **구현만 고쳐서** 통과하는 것.\n${testFiles.map((f) => `- \`${f}\``).join('\n')}`
      : '테스트가 아직 없습니다 — 스펙 단계에서 멈췄습니다.',
    redCount === null ? '' : `빨강은 통과했습니다(구현 없이 ${redCount}건 실패).`, '',
    '## 진행', ...진행, '',
    '## 현재 상황',
    branch ? `- 브랜치 \`${branch}\` 에 올려 뒀습니다` : '- 브랜치를 올리지 못했습니다',
    worktree ? `- 작업 공간 \`${worktree}\`` : '',
    '```', 뒤에서(output, BODY_OUTPUT_CHARS) || '(출력 없음)', '```', '',
    '## 이어서 하려면',
    branch ? `\`git fetch && git checkout ${branch}\` 로 이어받으면 됩니다.` : '',
    '테스트는 그대로 두고 구현만 고치는 것이 이 프로세스의 규칙입니다.',
  ].filter((l) => l !== '').join('\n');
}

/**
 * 스레드 덧글 — 사람이 아침에 본다.
 *
 * 이슈만 만들면 사람이 그걸 볼 이유가 없다. 여기서 막혔다고 덧글로 올려야 이어받는다.
 */
export function stuckComment(info) {
  const {
    kind, branch, who, testFiles = [], redCount = null,
    round = 0, maxRounds = 0, verdict = null, output = '',
  } = info;

  if (kind === StuckKind.AGENT_FAILED) {
    return [
      `파이프라인이 **${who ?? '에이전트'} 실행 실패**로 ${round}회차에서 멈췄습니다.`, '',
      branch ? `- 브랜치 \`${branch}\` 에 올려 뒀습니다` : '- 브랜치를 올리지 못했습니다',
      '- 회차를 쓴 것이 아니라 호출 자체가 실패했습니다 — 모델·자격증명·네트워크를 먼저 보세요.', '',
      '마지막 출력:', '```', 뒤에서(output, COMMENT_OUTPUT_CHARS) || '(출력 없음)', '```',
    ].filter((l) => l !== '').join('\n');
  }

  return [
    `파이프라인이 ${maxRounds}회를 다 쓰고 막혔습니다 (${verdict ?? '판정 없음'}).`, '',
    branch ? `- 브랜치 \`${branch}\` 에 올려 뒀습니다` : '- 브랜치를 올리지 못했습니다',
    redCount === null
      ? '- 빨강 기록이 없습니다'
      : `- 테스트 ${testFiles.length}건은 빨강을 통과했습니다(구현 없이 ${redCount}건 실패)`, '',
    '마지막 실패:', '```', 뒤에서(output, COMMENT_OUTPUT_CHARS) || '(출력 없음)', '```', '',
    '**스펙 자체를 다시 봐야 할 수도 있습니다.** 구현이 계속 어긋나면 스펙이 애매하다는',
    '뜻일 때가 많습니다 — 그렇게 보이면 스펙부터 고쳐 주세요.',
  ].filter((l) => l !== '').join('\n');
}
