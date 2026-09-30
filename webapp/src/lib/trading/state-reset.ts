/**
 * 전략 영속 상태 초기화 — **순수** (#513).
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────
 *
 * v4·VR 의 상태는 `TradingPortfolio.state.v4` / `.vr` 에 있다 — **포트폴리오에 붙어 있고
 * 계좌에는 안 붙어 있다.** 그래서 계정의 자격증명만 새 계좌로 갈아끼우면 브로커 보유는 0인데
 * 전략 상태는 옛 계좌 이력 그대로 남는다.
 *
 * 자동으로는 안 풀린다. `reconcileDay` 는 **매도 체결이 있을 때만** 사이클을 리셋한다
 * (`soldQty > 0 && holdingAfter <= 0`). 새 계좌엔 체결이 아예 없어 그 분기에 못 들어가고,
 * `absorbIdleCash` 는 `cycleCash` 만 건드린다. 결과적으로 보유 0인 계좌에서 `t=3.09` 가
 * 살아남아 "3회차 진행 중" 으로 1회매수금·별지점을 계산한다 — **첫 사이클이 틀린 크기로
 * 주문한다.**
 *
 * ── 지우지 않고 옮긴다 ─────────────────────────────────────────────
 *
 * `$unset` 이 아니라 `state.archive` 로 **원본을 통째로 옮긴다**. 이 저장소의 소프트 삭제
 * 원칙이기도 하고, 실제로 #348 에서 config 가 덮였을 때 백업이 없어 15 거래일치를 역산해야
 * 했다. 상태는 설정보다 되살리기가 더 어렵다(복리로 불어난 `cycleCash`, 사이클 진행도 `t`).
 *
 * 지울 키를 목록으로 들고 있지 않다 — `archive` 를 뺀 **전부**가 대상이다. 새 전략이 상태를
 * 추가해도 여기를 고칠 일이 없다(고치는 걸 잊는 쪽이 더 흔한 사고다).
 */

/** 포트폴리오의 `state` — 전략마다 자유 구조라 Mixed 다. */
export type PortfolioState = Record<string, unknown>;

export type StateArchiveEntry = {
  /** 언제 (ISO) — 호출측이 넘긴다. 이 모듈은 시계를 모른다 */
  at: string;
  /** 왜 지웠나 — "계좌 교체" 처럼 나중에 읽고 판단할 수 있게 */
  reason: string;
  /** 지운 값 원본 그대로 */
  state: PortfolioState;
};

export type ResetPlan = {
  /** 지워질 상태 키 */
  cleared: string[];
  /** `updateOne($set)` 에 그대로 넣을 패치. 지울 게 없으면 없다 */
  patch?: { state: PortfolioState };
  /** 지울 게 없어서 건너뛴 이유 */
  skipped?: string;
};

/** 이력 자체가 문서를 부풀리지 않게. 계좌 교체가 이만큼 잦을 일은 없다. */
const KEEP_ARCHIVE = 10;

/** 이력을 담는 칸. 이 키는 지우지 않는다 — 지우면 이력이 매번 초기화된다. */
const ARCHIVE_KEY = "archive";

/**
 * 무엇을 지우고 무엇을 남길지 정한다. 순수(불변) — 입력을 건드리지 않는다.
 *
 * `state` 를 통째로 새 객체로 교체하는 패치를 만든다(`$set: { state }`). 키를 하나씩
 * `$unset` 하지 않는 이유는 **원자적**이어야 하기 때문이다 — 절반만 지워진 상태로
 * 사이클이 돌면 그게 더 나쁘다.
 */
export function planStateReset(
  state: PortfolioState | null | undefined,
  opts: { at: string; reason: string; keepArchive?: number },
): ResetPlan {
  const cur = state ?? {};
  const cleared = Object.keys(cur).filter((k) => k !== ARCHIVE_KEY);
  if (cleared.length === 0) {
    return { cleared: [], skipped: "지울 전략 상태가 없습니다" };
  }

  const moved: PortfolioState = {};
  for (const k of cleared) moved[k] = cur[k];

  const prior = Array.isArray(cur[ARCHIVE_KEY]) ? (cur[ARCHIVE_KEY] as StateArchiveEntry[]) : [];
  const keep = opts.keepArchive ?? KEEP_ARCHIVE;
  const entry: StateArchiveEntry = { at: opts.at, reason: opts.reason, state: moved };
  const archive = [...prior, entry].slice(-keep); // 오래된 것부터 밀려난다

  return { cleared, patch: { state: { [ARCHIVE_KEY]: archive } } };
}

/** 사람이 읽을 한 줄 — 스크립트의 dry-run 출력에 쓴다. */
export function describeReset(label: string, plan: ResetPlan): string {
  return plan.cleared.length
    ? `${label}: 초기화 ${plan.cleared.join(", ")}`
    : `${label}: 건너뜀 (${plan.skipped})`;
}
