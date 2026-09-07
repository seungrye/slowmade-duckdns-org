// The four trading datasets to export (#181).
//
// Only column definitions live here - pure. Reading the documents is the route's job (so this is verifiable without a DB).
//
// The headers match the words used on screen (`/admin/trading/monitor`). Whoever receives the file must be
// able to hold the table against the screen.

import type { Column } from './export-csv';

export type DatasetId = 'orders' | 'portfolio' | 'runs' | 'trades';

/** Documents written before the schema grew are missing fields - accept loosely so no shape can throw. */
type Doc = Record<string, unknown>;

const s = (k: string) => (r: Doc) => r[k] as string | undefined;
const n = (k: string) => (r: Doc) => r[k] as number | undefined;
const b = (k: string) => (r: Doc) => r[k] as boolean | undefined;
const d = (k: string) => (r: Doc) => r[k] as Date | undefined;

export interface Dataset {
  id: DatasetId;
  /** The Korean name used in the filename and on the button. */
  label: string;
  /** The model key for the Mongo collection - the route picks the model with it. */
  model: 'TradingOrderLog' | 'PortfolioHistory' | 'TradingRun' | 'StockTrade';
  /** The field to sort by, newest first. */
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
      // Older documents use `date`, newer ones `dateStr` - both are read.
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

/** `매매기록-주문로그-20260818.csv` - the name alone says what was exported and when. The date is Korean time. */
export function exportFileName(id: DatasetId, at: Date): string {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(at).replace(/-/g, '');
  return `매매기록-${datasetById(id)?.label ?? id}-${day}.csv`;
}
