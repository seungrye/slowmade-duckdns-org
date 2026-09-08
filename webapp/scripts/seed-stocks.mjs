#!/usr/bin/env node
// scripts/seed-stocks.mjs - seeding the KOSPI200 + S&P500 + NASDAQ-100 symbol metadata.
//
// It reads the universe cache text files stock-automator refreshes daily and
// upserts them into the site DB's stocks collection.
//
//   /home/seungrye/stock-automator/universe/.cache/kospi200.txt
//   /home/seungrye/stock-automator/universe/.cache/sp500.txt
//   /home/seungrye/stock-automator/universe/.cache/nasdaq100.txt
//
// Each file: a first line of `# fetched: YYYY-MM-DD`, then one ticker per line.
// A symbol in both SP500 and NASDAQ-100 (AAPL, for example) is merged with the union of its indices.
//
// name/exchange/sector are left empty - stock-automator's ingest fills them in later.
//   (At this point they are placeholders: name=ticker, exchange=the market code, sector="".)
//
// Usage: pnpm exec node scripts/seed-stocks.mjs
// Required env: MONGO_URI
// Optional env: UNIVERSE_CACHE_DIR (default /home/seungrye/stock-automator/universe/.cache)

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

  // A raw schema - avoiding a clash with the model code (the script owns its collection handle).
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
      // Unifying the KIS spelling - Wikipedia's BRK-B -> KIS's BRK.B (US only).
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
