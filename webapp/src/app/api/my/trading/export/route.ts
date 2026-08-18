// /api/my/trading/export — 매매기록 CSV 내려주기 (#181).
//
// 화면에서 눈으로 보는 것 말고는 기록을 밖으로 뺄 방법이 없었다. 수익률을 따로 계산하거나
// 세금 자료로 쓰려면 손으로 옮겨 적어야 했다.
//
// 변환은 전부 `export-csv.ts`(순수)가 한다. 여기가 하는 일은 셋뿐이다 —
// 인가, 문서 읽어 오기, 파일로 내려보내기.

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { requireOwner } from '@/lib/require-owner';
import { toCsv } from '@/lib/trading/export-csv';
import { datasetById, exportFileName, DATASETS } from '@/lib/trading/export-datasets';
import TradingOrderLog from '@/models/trading-order-log';
import PortfolioHistory from '@/models/portfolio-history';
import TradingRun from '@/models/trading-run';
import StockTrade from '@/models/stock-trade';
import type { Model } from 'mongoose';

// 데이터셋 정의는 순수 모듈에 있어 모델을 모른다 — 여기서 이어 붙인다.
const MODELS: Record<string, Model<unknown>> = {
  TradingOrderLog: TradingOrderLog as unknown as Model<unknown>,
  PortfolioHistory: PortfolioHistory as unknown as Model<unknown>,
  TradingRun: TradingRun as unknown as Model<unknown>,
  StockTrade: StockTrade as unknown as Model<unknown>,
};

/**
 * 한 번에 내보내는 최대 행 수.
 *
 * 지금 가장 큰 것이 206 행이라 걸릴 일이 없지만, 몇 해 쌓이면 이야기가 달라진다.
 * 잘렸는데 모르면 합계가 조용히 틀리므로, 상한에 닿으면 **헤더로 알린다**(`X-Export-Truncated`).
 */
const MAX_ROWS = 50_000;

export async function GET(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  // `req.nextUrl` 대신 표준 URL 로 읽는다 — 저장소의 다른 라우트와 같은 방식이고,
  // 평범한 Request 로도 동작해 테스트에서 Next 런타임을 흉내 낼 필요가 없다.
  const id = new URL(req.url).searchParams.get('dataset') ?? '';
  const dataset = datasetById(id);
  if (!dataset) {
    return NextResponse.json(
      { message: `알 수 없는 대상입니다: ${id || '(빈 값)'}`, available: DATASETS.map((d) => d.id) },
      { status: 400 },
    );
  }

  await connectToDB();
  const rows = (await MODELS[dataset.model]
    .find({})
    .sort({ [dataset.sortBy]: -1 })
    .limit(MAX_ROWS)
    .lean()) as Record<string, unknown>[];

  const csv = toCsv(rows, dataset.columns);
  const name = exportFileName(dataset.id, new Date());

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // 파일명이 한글이라 `filename*`(RFC 5987) 로 싣는다. 옛 클라이언트용 `filename` 은
      // ASCII 만 담을 수 있어 데이터셋 id 로 대체한다.
      'Content-Disposition':
        `attachment; filename="trading-${dataset.id}.csv"; ` +
        `filename*=UTF-8''${encodeURIComponent(name)}`,
      // 매매 내역이다 — 중간 캐시에 남기지 않는다.
      'Cache-Control': 'private, no-store',
      'X-Export-Rows': String(rows.length),
      ...(rows.length >= MAX_ROWS ? { 'X-Export-Truncated': 'true' } : {}),
    },
  });
}
