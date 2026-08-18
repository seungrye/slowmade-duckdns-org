// 내보낼 매매 데이터 4종 (#181).
//
// 컬럼 정의만 둔다 — 순수하다. 문서를 읽어 오는 일은 라우트가 한다(그래야 DB 없이 검증된다).
//
// 머리글은 화면(`/admin/trading/monitor`)에서 쓰는 말과 맞췄다. 받아 본 사람이 표를 보고
// 화면과 대조할 수 있어야 한다.

import type { Column } from './export-csv';

export type DatasetId = 'orders' | 'portfolio' | 'runs' | 'trades';

/** 스키마가 자란 뒤에 뽑은 옛 문서엔 없는 필드가 있다 — 어떤 모양이 와도 터지지 않게 느슨히 받는다. */
type Doc = Record<string, unknown>;

const s = (k: string) => (r: Doc) => r[k] as string | undefined;
const n = (k: string) => (r: Doc) => r[k] as number | undefined;
const b = (k: string) => (r: Doc) => r[k] as boolean | undefined;
const d = (k: string) => (r: Doc) => r[k] as Date | undefined;

export interface Dataset {
  id: DatasetId;
  /** 파일 이름과 버튼에 쓰는 한글 이름. */
  label: string;
  /** 몽고 컬렉션에 대응하는 모델 키 — 라우트가 이걸로 모델을 고른다. */
  model: 'TradingOrderLog' | 'PortfolioHistory' | 'TradingRun' | 'StockTrade';
  /** 최신순 정렬 기준 필드. */
  sortBy: string;
  columns: Column<Doc>[];
}

export const DATASETS: Dataset[] = [
  {
    id: 'orders',
    label: '주문로그',
    model: 'TradingOrderLog',
    sortBy: 'createdAt',
    columns: [
      { header: '시각', value: d('createdAt') },
      { header: '계정', value: s('envKey') },
      { header: '시장', value: s('market') },
      { header: '전략', value: s('strategy') },
      { header: '종목', value: s('symbol') },
      { header: '방향', value: s('side') },
      { header: '수량', value: n('qty') },
      { header: '가격', value: n('price') },
      { header: '주문유형', value: s('ordType') },
      { header: '사유', value: s('reason') },
      { header: '모의', value: b('dryRun') },
      { header: '주문번호', value: s('orderNo') },
    ],
  },
  {
    id: 'portfolio',
    label: '포트폴리오이력',
    model: 'PortfolioHistory',
    sortBy: 'dateStr',
    columns: [
      // 옛 문서는 `date`, 최근 것은 `dateStr` 을 쓴다 — 둘 다 본다.
      { header: '일자', value: (r) => (r.dateStr ?? r.date) as string | undefined },
      { header: '환경', value: s('env') },
      { header: '통화', value: s('currency') },
      { header: '총평가', value: n('totalValue') },
      { header: '현금', value: n('cash') },
      { header: '보유평가', value: n('holdingsValue') },
      { header: '당일손익', value: n('runPnl') },
      { header: '누적손익', value: n('cumulativePnl') },
      { header: '숨김', value: b('hidden') },
    ],
  },
  {
    id: 'runs',
    label: '실행이력',
    model: 'TradingRun',
    sortBy: 'startedAt',
    columns: [
      { header: '일자', value: s('dateKey') },
      { header: '단계', value: s('phase') },
      { header: '상태', value: s('status') },
      { header: '시작', value: d('startedAt') },
      { header: '종료', value: d('finishedAt') },
      { header: '모의', value: b('dryRun') },
      { header: '보정실행', value: b('catchUp') },
      { header: '요약', value: s('summary') },
      { header: '오류', value: s('error') },
    ],
  },
  {
    id: 'trades',
    label: '체결기록',
    model: 'StockTrade',
    sortBy: 'time',
    columns: [
      { header: '일자', value: s('date') },
      { header: '시각', value: s('time') },
      { header: '환경', value: s('env') },
      { header: '종목', value: s('ticker') },
      { header: '구분', value: s('action') },
      { header: '전략', value: s('strategy') },
      { header: '수량', value: n('qty') },
      { header: '누적수량', value: n('cumulativeQty') },
      { header: '가격', value: n('price') },
      { header: '금액', value: n('amount') },
      { header: '통화', value: s('currency') },
      { header: '숨김', value: b('hidden') },
    ],
  },
];

export function datasetById(id: string): Dataset | undefined {
  return DATASETS.find((x) => x.id === id);
}

/** `매매기록-주문로그-20260818.csv` — 무엇을 언제 뽑았는지 이름만 봐도 알게. 날짜는 한국 기준. */
export function exportFileName(id: DatasetId, at: Date): string {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(at).replace(/-/g, '');
  return `매매기록-${datasetById(id)?.label ?? id}-${day}.csv`;
}
