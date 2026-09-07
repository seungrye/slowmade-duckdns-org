// /api/my/trading/export - serving the trade records as CSV (#181).
//
// There was no way to get the records out beyond reading them on screen. Computing a return separately, or using them
// for tax paperwork, meant copying them out by hand.
//
// All the conversion belongs to `export-csv.ts` (pure). This file does three things only -
// authorise, read the documents, and send them down as a file.

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

// The dataset definitions live in a pure module and know nothing of the models - they are joined here.
const MODELS: Record<string, Model<unknown>> = {
  TradingOrderLog: TradingOrderLog as unknown as Model<unknown>,
  PortfolioHistory: PortfolioHistory as unknown as Model<unknown>,
  TradingRun: TradingRun as unknown as Model<unknown>,
  StockTrade: StockTrade as unknown as Model<unknown>,
};

/**
 * The maximum rows exported at once.
 *
 * The largest today is 206 rows, so it is never hit, but after a few years that changes.
 * Being truncated without knowing makes the totals quietly wrong, so hitting the cap **is reported in a header**
 * (`X-Export-Truncated`).
 */
const MAX_ROWS = 50_000;

export async function GET(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  // It reads through the standard URL rather than `req.nextUrl` - the same way as the repo's other routes, and it
  // works with a plain Request, so tests need not mimic the Next runtime.
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
      // The filename is Korean, so it travels as `filename*` (RFC 5987). The legacy `filename` can hold only ASCII,
      // so it uses the dataset id instead.
      'Content-Disposition':
        `attachment; filename="trading-${dataset.id}.csv"; ` +
        `filename*=UTF-8''${encodeURIComponent(name)}`,
      // It is trade history - never left in an intermediate cache.
      'Cache-Control': 'private, no-store',
      'X-Export-Rows': String(rows.length),
      ...(rows.length >= MAX_ROWS ? { 'X-Export-Truncated': 'true' } : {}),
    },
  });
}
