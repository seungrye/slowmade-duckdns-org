#!/usr/bin/env node
// scripts/ingest-trades.mjs — stock-automator trades.json 덤프(JSONL) → MongoDB.
//
// usage:
//   pnpm exec node --env-file=.env.local scripts/ingest-trades.mjs [path]
//
// (env, ticker, time) unique key — 같은 trade 중복 upsert.

import fs from 'node:fs';
import readline from 'node:readline';
import mongoose from 'mongoose';

const BATCH = 500;

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI 가 설정되지 않았습니다.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const Trades = mongoose.connection.collection('stocktrades');
  await Trades.createIndex({ env: 1, ticker: 1, time: 1 }, { unique: true });
  await Trades.createIndex({ ticker: 1, date: 1 });

  const inputPath = process.argv[2];
  const stream = inputPath ? fs.createReadStream(inputPath, { encoding: 'utf-8' }) : process.stdin;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let processed = 0, upserted = 0, skipped = 0;
  let ops = [];

  async function flush() {
    if (!ops.length) return;
    try {
      const r = await Trades.bulkWrite(ops, { ordered: false });
      upserted += (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0);
    } catch (e) {
      console.error(`[bulkWrite] partial: ${e.message}`);
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
    if (!rec.env || !rec.ticker || !rec.action || !rec.time || !rec.date) {
      skipped++;
      continue;
    }
    ops.push({
      updateOne: {
        filter: { env: rec.env, ticker: rec.ticker, time: rec.time },
        update: {
          $set: {
            env: rec.env,
            ticker: rec.ticker,
            action: rec.action,
            qty: rec.qty,
            price: rec.price,
            amount: rec.amount,
            currency: rec.currency ?? 'KRW',
            date: rec.date,
            time: rec.time,
          },
          $currentDate: { updatedAt: true },
        },
        upsert: true,
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  console.log(`✅ done: processed=${processed} upserted=${upserted} skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
