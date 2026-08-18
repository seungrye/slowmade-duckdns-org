// /api/my/trading/export/sheets — 매매기록을 구글 시트로 (#181 2단계).
//
// CSV(같은 폴더의 `route.ts`)와 **같은 컬럼 정의**(`export-datasets.ts`)를 본다. 두 내보내기의
// 내용이 어긋날 수 없다. 다른 점은 하나뿐 — 숫자를 숫자로 보내 시트에서 합계가 되게 한다.
//
// 시트 하나에 탭 넷을 만든다. 데이터셋마다 파일을 만들면 링크가 넷이 된다.

import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { requireOwner } from '@/lib/require-owner';
import { env } from '@/lib/env';
import { getAccessToken } from '@/lib/google/oauth';
import { createSpreadsheet, spreadsheetTitle, tabTitle, toSheetValues, type SheetTab } from '@/lib/google/sheets';
import { DATASETS } from '@/lib/trading/export-datasets';
import TradingOrderLog from '@/models/trading-order-log';
import PortfolioHistory from '@/models/portfolio-history';
import TradingRun from '@/models/trading-run';
import StockTrade from '@/models/stock-trade';
import type { Model } from 'mongoose';

const MODELS: Record<string, Model<unknown>> = {
  TradingOrderLog: TradingOrderLog as unknown as Model<unknown>,
  PortfolioHistory: PortfolioHistory as unknown as Model<unknown>,
  TradingRun: TradingRun as unknown as Model<unknown>,
  StockTrade: StockTrade as unknown as Model<unknown>,
};

/** CSV 쪽과 같은 상한. 지금 가장 큰 것이 206 행이라 걸릴 일이 없다. */
const MAX_ROWS = 50_000;

export async function POST(_req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;

  if (!env.google.sheetsExport) {
    return NextResponse.json(
      { message: '구글 시트 내보내기가 아직 켜져 있지 않습니다. (GOOGLE_SHEETS_EXPORT 미설정)' },
      { status: 503 },
    );
  }

  const token = await getAccessToken(owner.email);
  if (!token) {
    // 인증이 없는 게 아니라 **구글 동의가 없는** 상태다. 사용자가 할 일이 분명하니 그대로 알린다.
    return NextResponse.json(
      { message: '구글 드라이브 접근 동의가 없습니다. 로그아웃 후 다시 로그인해 동의해 주세요.' },
      { status: 409 },
    );
  }

  await connectToDB();
  const tabs: SheetTab[] = [];
  for (const d of DATASETS) {
    const rows = (await MODELS[d.model]
      .find({})
      .sort({ [d.sortBy]: -1 })
      .limit(MAX_ROWS)
      .lean()) as Record<string, unknown>[];
    tabs.push({ title: tabTitle(d.id), values: toSheetValues(rows, d.columns) });
  }

  try {
    const url = await createSpreadsheet(token, spreadsheetTitle(new Date()), tabs);
    return NextResponse.json({
      url,
      rows: Object.fromEntries(DATASETS.map((d, i) => [d.id, tabs[i].values.length - 1])),
    });
  } catch (err) {
    // 구글이 준 이유를 그대로 올린다 — "API 미사용"과 "권한 없음"은 대응이 다르다.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('구글 시트 내보내기 실패', msg);
    return NextResponse.json({ message: `구글 시트를 만들지 못했습니다. ${msg}` }, { status: 502 });
  }
}
