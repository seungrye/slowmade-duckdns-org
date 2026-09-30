/**
 * 주문 거부 사유 분류 — **순수** (#509).
 *
 * ── 왜 휴장일 표가 아니라 이것인가 ────────────────────────────────
 *
 * 처음엔 휴장일 달력을 만들려 했다. 그런데 그건 매년 손으로 갱신해야 하고(음력 설·추석·
 * 부처님오신날 때문에 계산도 간단치 않다), 갱신을 잊는 순간 그 해 휴일이 전부 '거래일' 이
 * 되어 **조용히 틀린다.**
 *
 * 증권사는 이미 답을 알고 있다. 주문을 내면 거부 사유를 코드로 돌려준다. 그걸 **분류해서
 * 사람에게 말해 주면** 달력을 유지할 필요가 없다 — 휴장일이든 계좌 만료든 증거금 부족이든,
 * 판단은 증권사가 하고 우리는 전달만 한다.
 *
 * ── 분류가 하는 일 ───────────────────────────────────────────────
 *
 * 같은 "주문 거부" 라도 사람이 할 일이 다르다:
 *   · 휴장일       → 아무것도 안 해도 된다. 알림만 조용히
 *   · 계좌/권한     → **사람이 증권사에서 조치**해야 한다. 안 고치면 매일 반복된다
 *   · 자금/수량     → 설정이나 잔고 문제. 전략 파라미터를 봐야 한다
 *   · 주문값        → 호가단위·가격 범위. 코드 버그일 수 있다
 *   · 일시          → 유량·지연. 다음 사이클에 자연히 풀린다
 *
 * 실제로 겪은 것: 2026-09-24·25 추석엔 국내 휴장이라 거부됐고, 그 뒤로는 **모의투자 참가
 * 기간이 끝나서** 거부됐다. 사유 코드는 둘 다 `40910000` 계열로 보였지만 사람이 할 일은
 * 전혀 달랐다 — 앞은 기다리면 되고 뒤는 재신청해야 했다. 날짜만으로는 구분할 수 없었고,
 * 실제로 우리는 그걸 6영업일 동안 몰랐다.
 */

export type RejectKind =
  | "holiday"      // 휴장일·장운영시간 밖
  | "account"      // 계좌 상태·권한·모의투자 기간 만료
  | "funds"        // 증거금·주문가능금액·수량 부족
  | "order"        // 호가단위·가격제한·주문값 오류
  | "transient"    // 유량제한·서버 지연 — 다음에 풀린다
  | "unknown";

export type RejectInfo = {
  kind: RejectKind;
  /** 사람이 읽을 한 줄 — 무엇을 해야 하는지까지 */
  advice: string;
  /** 사람이 조치해야 풀리는가. 이게 true 면 계속 반복되므로 메일이 나가야 한다 */
  needsAction: boolean;
};

/** 코드·문구 → 분류. 증권사가 쓰는 표현이 제각각이라 코드와 한글 문구를 함께 본다. */
const RULES: { kind: RejectKind; codes: string[]; words: RegExp; advice: string;
               needsAction: boolean }[] = [
  {
    kind: "holiday",
    codes: ["40910001", "40580000"],
    words: /휴장|영업일이 아|장운영일이 아|거래시간이 아|장 ?시간이 아|정규장이 아/,
    advice: "휴장일이거나 장 운영시간이 아닙니다 — 조치할 것 없습니다. 다음 거래일에 정상 동작합니다.",
    needsAction: false,
  },
  {
    kind: "account",
    codes: ["40910000", "40570000"],
    // "모의투자 주문이 불가한 계좌" — 참가 기간 만료가 대표적이다
    words: /불가한 계좌|계좌가 없|계좌 ?상태|사용자권한|권한이 없|모의투자 (참가|기간)|해지|정지/,
    advice: "계좌 상태·권한 문제입니다. 증권사에서 확인·조치해야 하며, 그때까지 매 사이클 반복됩니다"
      + "(모의투자는 참가 기간이 끝나면 조회는 되는데 주문만 거부됩니다).",
    needsAction: true,
  },
  {
    kind: "funds",
    codes: ["40250000", "40240000"],
    words: /주문가능금액|증거금|예수금|잔고가 부족|수량이 부족|매도가능수량/,
    advice: "자금·수량이 부족합니다. 예약 현금(reservedCash)·원금 설정과 실제 잔고를 대조하세요.",
    needsAction: true,
  },
  {
    kind: "order",
    codes: ["40030000", "40310000"],
    words: /호가단위|가격이 범위|상한가|하한가|주문단가|주문수량.*오류|단위 ?오류/,
    advice: "주문값이 거부됐습니다(호가단위·가격제한). 계산 쪽 버그일 수 있으니 로그의 가격·수량을 보세요.",
    needsAction: true,
  },
  {
    kind: "transient",
    codes: ["EGW00201", "90020000", "OPSQ0003", "OPSQ0008"],
    words: /초당 거래건수|지연되고 있|잠시후|일시적|처리 중 오류|MCI전송/,
    advice: "일시적인 오류입니다 — 다음 사이클에 자연히 풀립니다.",
    needsAction: false,
  },
];

/** 거부 메시지 하나를 분류한다. 모르면 `unknown` 이고, 모른다는 걸 숨기지 않는다. */
export function classifyReject(message: string): RejectInfo {
  const m = message ?? "";
  for (const r of RULES) {
    if (r.codes.some((c) => m.includes(c)) || r.words.test(m)) {
      return { kind: r.kind, advice: r.advice, needsAction: r.needsAction };
    }
  }
  return {
    kind: "unknown",
    advice: "처음 보는 거부 사유입니다 — 원문을 확인하세요. 반복되면 분류 규칙에 추가해야 합니다.",
    needsAction: true, // 모르면 사람이 봐야 한다. 조용히 넘기는 쪽이 더 위험하다
  };
}

/**
 * 한 사이클의 거부들을 종합한다 — 메일 제목·본문을 정하는 데 쓴다.
 *
 * **가장 무거운 사유가 이긴다.** 휴장일 거부 10건과 계좌 거부 1건이 섞이면 사람이 봐야
 * 하는 건 계좌 쪽이다.
 */
const WEIGHT: Record<RejectKind, number> = {
  account: 5, order: 4, funds: 3, unknown: 2, transient: 1, holiday: 0,
};

export function summarizeRejects(messages: string[]): RejectInfo & { counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  let worst: RejectInfo = { kind: "holiday", advice: "", needsAction: false };
  let worstW = -1;
  for (const m of messages) {
    const info = classifyReject(m);
    counts[info.kind] = (counts[info.kind] ?? 0) + 1;
    if (WEIGHT[info.kind] > worstW) { worstW = WEIGHT[info.kind]; worst = info; }
  }
  if (!messages.length) {
    return { kind: "unknown", advice: "", needsAction: false, counts };
  }
  return { ...worst, counts };
}
