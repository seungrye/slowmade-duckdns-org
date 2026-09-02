/**
 * 블록의 과거 보유 평가액을 매매기록으로 되살린다 — 순수 (#373).
 *
 * 블록 행은 #369 부터 하루 한 점씩 쌓이는데, 그 전 구간은 영영 빈칸이다. 점이 하나뿐인
 * 라인은 아무것도 안 그려져서 차트에 범례 이름만 뜬다.
 *
 * 되살릴 수 있는 건 **보유 평가액뿐**이다. 블록 장부 현금(v4 `cycleCash`·VR `pool`)은
 * 과거값이 DB 에 없다 — 없는 것은 지어내지 않는다.
 *
 * 값은 전부 실측이다: 수량은 그 블록에 귀속된 체결(#372)의 누적, 가격은 `stockdailyprices`
 * 의 종가. 종가가 빠진 날은 **직전 종가를 끌어 쓴다** — 0 으로 두면 그날만 자산이 사라진
 * 것처럼 보이는 거짓 골짜기가 생긴다.
 */
export type BackfillTrade = {
  ticker: string;
  date: string; // YYYY-MM-DD
  action: "buy" | "sell";
  qty: number;
  /** 종가가 아직 없는 초기 구간의 가격 씨앗(체결가). */
  price?: number;
};

export type BackfillPoint = { date: string; holdingsValue: number; qty: number };

export function blockValueSeries(args: {
  trades: BackfillTrade[];
  /** ticker → (date → 종가) */
  closes: Map<string, Map<string, number>>;
  /** 그릴 날짜 축(오름차순). 보통 그 종목들의 일봉 날짜 합집합. */
  dates: string[];
}): BackfillPoint[] {
  const { trades, closes, dates } = args;
  if (!trades.length || !dates.length) return [];

  const 시작 = trades.reduce((m, t) => (t.date < m ? t.date : m), trades[0].date);
  const 날짜별매매 = new Map<string, BackfillTrade[]>();
  for (const t of trades) {
    (날짜별매매.get(t.date) ?? 날짜별매매.set(t.date, []).get(t.date)!).push(t);
  }

  const 보유 = new Map<string, number>();
  const 마지막가 = new Map<string, number>();
  const out: BackfillPoint[] = [];

  for (const d of dates) {
    if (d < 시작) continue;
    for (const t of 날짜별매매.get(d) ?? []) {
      const cur = 보유.get(t.ticker) ?? 0;
      보유.set(t.ticker, Math.max(0, t.action === "buy" ? cur + t.qty : cur - t.qty));
      // 종가가 아직 없는 초기 구간은 체결가로 시작한다(둘 다 실측값이다).
      if (t.price && t.price > 0 && !마지막가.has(t.ticker)) 마지막가.set(t.ticker, t.price);
    }
    let value = 0;
    let qtySum = 0;
    for (const [ticker, qty] of 보유) {
      if (qty <= 0) continue;
      const close = closes.get(ticker)?.get(d);
      if (close && close > 0) 마지막가.set(ticker, close);
      const px = 마지막가.get(ticker);
      if (!px) continue; // 가격을 한 번도 못 본 종목은 값에서 뺀다(0 으로 세지 않는다)
      value += qty * px;
      qtySum += qty;
    }
    out.push({ date: d, holdingsValue: value, qty: qtySum });
  }
  return out;
}
