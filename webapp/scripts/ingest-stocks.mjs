#!/usr/bin/env node
// scripts/ingest-stocks.mjs - a stock-automator parquet dump (JSONL) -> a MongoDB bulkWrite.
//
// The input format (1 record per line):
//   {"ticker":"AAPL","date":"2026-06-12","open":...,"high":...,"low":...,"close":...,"volume":...}
//
// How it works:
//   - a line-by-line stream through readline (safe for large files)
//   - a record whose close is null or missing is skipped (a required field)
//   - a bulkWrite every 1000 records (a ticker+date upsert)
//   - the result: the total processed, upserted and skipped counts
//
// usage:
//   pnpm exec node --env-file=.env.local scripts/ingest-stocks.mjs [path]
//   With no path given it reads from stdin.
//
// For example (a one-shot backfill):
//   /home/seungrye/stock-automator/.venv/bin/python \
//     /home/seungrye/stock-automator/scripts/dump_market_data.py \
//     /tmp/stock_prices.jsonl
//   pnpm exec node --env-file=.env.local scripts/ingest-stocks.mjs /tmp/stock_prices.jsonl

import fs from 'node:fs';
import readline from 'node:readline';
import mongoose from 'mongoose';

const BATCH = 1000;

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI 가 설정되지 않았습니다.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const Prices = mongoose.connection.collection('stockdailyprices');
  // Ensures the (ticker, date) unique index - a no-op when it already exists
  await Prices.createIndex({ ticker: 1, date: -1 }, { unique: true });

  const inputPath = process.argv[2];
  const stream = inputPath ? fs.createReadStream(inputPath, { encoding: 'utf-8' }) : process.stdin;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let processed = 0;
  let skipped = 0;
  let upserted = 0;
  let ops = [];

  async function flush() {
    if (ops.length === 0) return;
    try {
      const r = await Prices.bulkWrite(ops, { ordered: false });
      upserted += (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0);
    } catch (e) {
      // A duplicate key and so on - counted and skipped
      console.error(`[bulkWrite] partial error: ${e.message}`);
    }
    ops = [];
  }

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      skipped++;
      continue;
    }
    processed++;
    if (!rec.ticker || !rec.date || rec.close == null) {
      skipped++;
      continue;
    }
    const $set = {
      ticker: rec.ticker,
      date: rec.date,
      close: rec.close,
    };
    if (rec.open != null) $set.open = rec.open;
    if (rec.high != null) $set.high = rec.high;
    if (rec.low != null) $set.low = rec.low;
    if (rec.volume != null) $set.volume = rec.volume;
    ops.push({
      updateOne: {
        filter: { ticker: rec.ticker, date: rec.date },
        update: { $set, $currentDate: { updatedAt: true } },
        upsert: true,
      },
    });
    if (ops.length >= BATCH) {
      await flush();
      if (processed % 10000 === 0) {
        console.log(`processed ${processed} / upserted ${upserted}`);
      }
    }
  }
  await flush();

  console.log(`✅ done: processed=${processed} upserted=${upserted} skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
