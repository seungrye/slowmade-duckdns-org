#!/usr/bin/env node
// scripts/seed-stocks.mjs — KOSPI200 + S&P500 + NASDAQ-100 종목 메타 seed.
//
// stock-automator 가 매일 갱신하는 universe 캐시 텍스트 파일을 읽어
// site DB 의 stocks 컬렉션에 upsert.
//
//   /home/seungrye/stock-automator/universe/.cache/kospi200.txt
//   /home/seungrye/stock-automator/universe/.cache/sp500.txt
//   /home/seungrye/stock-automator/universe/.cache/nasdaq100.txt
//
// 각 파일: 첫 줄 `# fetched: YYYY-MM-DD`, 이후 한 줄당 ticker 하나.
// SP500 ∩ NASDAQ-100 (예: AAPL) 종목은 indices 합집합으로 통합.
//
// name/exchange/sector 는 비워둠 — 추후 stock-automator ingest 가 채움.
//   (이 시점엔 name=ticker, exchange=시장 코드, sector="" 로 placeholder).
//
// 사용: pnpm exec node scripts/seed-stocks.mjs
// 필수 env: MONGO_URI
// 옵션 env: UNIVERSE_CACHE_DIR (기본 /home/seungrye/stock-automator/universe/.cache)

import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

const CACHE_DIR =
  process.env.UNIVERSE_CACHE_DIR ?? '/home/seungrye/stock-automator/universe/.cache';

const SOURCES = [
  { file: 'kospi200.txt', index: 'KOSPI200', market: 'KR', exchange: 'KOSPI' },
  { file: 'sp500.txt', index: 'SP500', market: 'US', exchange: '' },
  { file: 'nasdaq100.txt', index: 'NASDAQ100', market: 'US', exchange: 'NASDAQ' },
];

function readTickers(file) {
  const p = path.join(CACHE_DIR, file);
  if (!fs.existsSync(p)) {
    console.warn(`[skip] ${p} 없음`);
    return [];
  }
  return fs
    .readFileSync(p, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI 가 설정되지 않았습니다.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  // raw schema — 모델 코드와 충돌 회피 (스크립트는 자체 컬렉션 핸들).
  const Stock = mongoose.model(
    'StockSeed',
    new mongoose.Schema({}, { strict: false, collection: 'stocks' }),
  );

  // ticker → { market, exchange, indices Set }
  const merged = new Map();

  for (const src of SOURCES) {
    const tickers = readTickers(src.file);
    console.log(`${src.file}: ${tickers.length} 종목`);
    for (const t of tickers) {
      // KIS 표기 통일 — Wikipedia BRK-B → KIS BRK.B (US 만).
      const ticker = src.market === 'US' ? t.replace('-', '.') : t;
      if (!merged.has(ticker)) {
        merged.set(ticker, {
          ticker,
          market: src.market,
          exchange: src.exchange,
          indices: new Set(),
        });
      }
      merged.get(ticker).indices.add(src.index);
    }
  }

  let upserted = 0;
  for (const meta of merged.values()) {
    const indices = Array.from(meta.indices);
    await Stock.findOneAndUpdate(
      { ticker: meta.ticker },
      {
        $set: {
          ticker: meta.ticker,
          name: meta.ticker, // placeholder — ingest 가 갱신
          market: meta.market,
          exchange: meta.exchange,
          indices,
          isDeleted: false,
        },
        $setOnInsert: { createdAt: new Date() },
        $currentDate: { updatedAt: true },
      },
      { upsert: true, new: true },
    );
    upserted++;
  }

  console.log(`✅ ${upserted} 종목 upsert 완료`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
