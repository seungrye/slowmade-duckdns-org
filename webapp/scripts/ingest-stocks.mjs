#!/usr/bin/env node
// scripts/ingest-stocks.mjs — stock-automator parquet 덤프(JSONL) → MongoDB bulkWrite.
//
// 입력 형식 (한 줄당 1 record):
//   {"ticker":"AAPL","date":"2026-06-12","open":...,"high":...,"low":...,"close":...,"volume":...}
//
// 동작:
//   - readline 으로 line-by-line stream (대용량 안전)
//   - close 가 null/누락 인 record 는 skip (필수 필드)
//   - 1000 records 마다 bulkWrite (ticker+date upsert)
//   - 결과: 총 처리/upsert/스킵 카운트
//
// usage:
//   pnpm exec node --env-file=.env.local scripts/ingest-stocks.mjs [path]
//   path 미지정 시 stdin 에서 읽음.
//
// 예 (백필 one-shot):
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
  // (ticker, date) unique 인덱스 보장 — 이미 있으면 no-op
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
      // 중복 키 등 — 카운트만 남기고 진행
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
