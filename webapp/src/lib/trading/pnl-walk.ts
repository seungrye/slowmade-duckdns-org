/**
 * 실현손익 원장 워크 — **순수**. DB·브로커·네트워크를 모른다.
 *
 * `close-sync.ts` 에서 떼어냈다 (#505). 화면(`lib/portfolio.ts`)이 블록별 손익을 파생하려면
 * 이 계산이 필요한데, `close-sync` 를 import 하면 **mongoose 모델·KIS 클라이언트·mailer 가
 * 페이지 렌더 그래프로 끌려온다.** 순수 부분만 여기 두고 `close-sync` 는 re-export 한다.
 *
 * ── 블록별 손익의 정의 (#505) ────────────────────────────────────────
 *
 * **그 블록에 귀속된 체결만으로 돌린 평균단가 워크.** 가장 단순한 정의다.
 *
 * "매도가 소진하는 원가를 파티션 지분대로 나눠 붙이는(pro-rata)" 안이 검토됐고 **기각**됐다 —
 * 합이 구성상 닫히는 대신, **한 주도 안 판 블록에 실현손익이 찍힌다**(A 100@10 / B 100@20 매수
 * → A 가 100@30 매도 → pro-rata 는 B 에게도 +750 을 준다). 잔여수량도 허구가 된다.
 *
 * 이 단순한 정의는 **귀속이 정확할 때만** 닫힌다. 그래서 `reconcileBooks` 로 스스로 검사한다 —
 * 실제로 귀속 버그 1건 때문에 42.06 이 3개월 동안 조용히 사라져 있었다.
 */

/** 원장 한 행 — 우리 DB(stocktrades)의 기록과 새로 들어온 체결이 같은 모양으로 섞인다. */
export type LedgerRow = {
  ticker: string; date: string; time: string; side: "buy" | "sell";
  qty: number; price: number; currency: string;
};

export type LedgerWalk = {
  /** 오늘(today) 실현손익 */
  run: number;
  /** **전체** 실현손익. 먹인 원장이 전부여야 뜻이 있다 */
  cum: number;
  /** `${ticker}|${time}|${side}` → 그 행 직후 보유수량 */
  cumQty: Map<string, number>;
  /** 원가를 모르는 매도 — 손익에서 **제외**했다. 0 으로 채우지 않는다 */
  unknownCost: string[];
  /** 날짜 → 그 날까지의 누적. 화면이 날짜별 곡선을 그릴 때 쓴다 */
  cumByDate: Map<string, number>;
  /** 종목 → 원장이 끝난 시점의 순수량. 증권사 보유수량과 대조하는 데 쓴다 */
  netQty: Map<string, number>;
};

export const ledgerKey = (r: { ticker: string; time: string; side: string }) =>
  `${r.ticker}|${r.time}|${r.side}`;

/** 결정적 정렬. 같은 초 안의 실제 체결 순서는 **알 수 없다** — 알 수 없다는 사실을 매번 같은
 *  방식으로 처리하는 것이 목표다(예전엔 입력 순서에 좌우됐다). 참값을 보장하지는 않는다. */
function sortRows<T extends { date: string; time: string; side: string; ticker: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1)
      : a.time !== b.time ? (a.time < b.time ? -1 : 1)
        : a.side !== b.side ? (a.side < b.side ? -1 : 1)
          : a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);
}

/**
 * 평균단가 회계로 원장을 훑어 실현손익과 누적수량을 낸다 (#500).
 *
 * 원가를 모르는 매도는 **0 으로 대체하지 않는다.** 손익에서 빼고 `unknownCost` 에 남긴다 —
 * 모르는 값을 0 으로 채우면 그게 곧 유령이익이다. 보유보다 많이 팔면 보유분만 손익을 낸다.
 */
export function walkLedger(rows: LedgerRow[], today: string): LedgerWalk {
  const pos = new Map<string, [number, number]>(); // ticker -> [qty, cost]
  const cumQty = new Map<string, number>();
  const cumByDate = new Map<string, number>();
  const unknownCost: string[] = [];
  let run = 0, cum = 0;

  for (const r of sortRows(rows)) {
    const st = pos.get(r.ticker) ?? [0, 0];
    if (r.side === "buy") {
      st[0] += r.qty;
      st[1] += r.qty * r.price;
    } else {
      const known = Math.min(r.qty, Math.max(0, st[0]));
      if (known > 0) {
        const avg = st[1] / st[0];
        const pnl = (r.price - avg) * known;
        cum += pnl;
        if (r.date === today) run += pnl;
        st[1] = Math.max(0, st[1] - avg * known);
        st[0] = st[0] - known;
      }
      if (known < r.qty) {
        unknownCost.push(`${r.ticker} ${r.date} 매도 ${r.qty - known}주 원가 미상(손익 제외)`);
      }
    }
    pos.set(r.ticker, st);
    cumQty.set(ledgerKey(r), st[0]);
    cumByDate.set(r.date, cum);
  }
  const netQty = new Map<string, number>();
  for (const [t, st] of pos) netQty.set(t, st[0]);
  return { run, cum, cumQty, unknownCost, cumByDate, netQty };
}

/** 그 날짜 이하의 마지막 누적값. 매매가 없는 날은 직전 값이 이어진다(0 으로 떨어지지 않는다). */
export function cumAsOf(cumByDate: Map<string, number>, dateStr: string): number {
  let best = 0;
  for (const [d, v] of cumByDate) if (d <= dateStr) best = v;
  return best;
}

/** 원장 한 행 + 그 체결이 어느 장부(book)에 속하는가. `book: ""` 는 무주 — 버리지 않는다. */
export type BookRow = LedgerRow & { book: string };

/**
 * book 별로 따로 걷고, 계좌 전체(pooled)도 함께 낸다.
 *
 * pooled 는 `book` 을 무시한 전체 워크다 — 분해가 닫히는지 검사할 기준선이 된다.
 */
export function walkBooks(rows: BookRow[], today: string): {
  books: Record<string, LedgerWalk>;
  pooled: LedgerWalk;
} {
  const by = new Map<string, BookRow[]>();
  for (const r of rows) (by.get(r.book) ?? by.set(r.book, []).get(r.book)!).push(r);
  const books: Record<string, LedgerWalk> = {};
  for (const [book, rs] of by) books[book] = walkLedger(rs, today);
  return { books, pooled: walkLedger(rows, today) };
}

/**
 * 분해가 닫히는지 검사한다 — **잔차가 있으면 반드시 이름 붙은 원인이 함께 나온다.**
 *
 * 42.06 이 3개월 숨은 이유는 이 검사가 없었던 것뿐이다. 잔차만 내고 원인을 안 내면 다음에도
 * 똑같이 숨는다. 원인은 두 갈래다:
 *   ① **원가 미상** — 매수와 매도가 다른 book 으로 갈렸다(귀속 버그). 이게 42 의 정체였다.
 *   ② **동시 보유** — 같은 종목을 두 book 이 동시에 들면 원가미상 없이도 평단 pooling 차이로
 *      잔차가 난다. 「원가미상」만 원인으로 적으면 이 경우를 설명하지 못한다.
 */
export function reconcileBooks(
  books: Record<string, LedgerWalk>, pooled: LedgerWalk,
): { residual: number; reasons: string[] } {
  const sum = Object.values(books).reduce((a, w) => a + w.cum, 0);
  const residual = sum - pooled.cum;
  const reasons: string[] = [];
  if (Math.abs(residual) < 1e-6) return { residual: 0, reasons };

  for (const [book, w] of Object.entries(books)) {
    for (const u of w.unknownCost) {
      reasons.push(`${book || "(무주)"}: ${u}`);
    }
  }
  // 동시 보유 — 같은 종목을 둘 이상의 book 이 끝까지 들고 있으면 구간이 겹쳤다는 뜻이다.
  const holders = new Map<string, string[]>();
  for (const [book, w] of Object.entries(books)) {
    for (const [ticker, qty] of w.netQty) {
      if (qty > 0) (holders.get(ticker) ?? holders.set(ticker, []).get(ticker)!).push(book || "(무주)");
    }
  }
  for (const [ticker, bs] of holders) {
    if (bs.length > 1) reasons.push(`${ticker}: ${bs.join("·")} 가 동시에 보유(평단이 갈린다)`);
  }
  if (!reasons.length) {
    reasons.push("원인 불명 — 원가미상도 동시보유도 아니다. 원장을 직접 봐야 한다");
  }
  return { residual, reasons };
}
