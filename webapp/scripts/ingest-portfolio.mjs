#!/usr/bin/env node
// scripts/ingest-portfolio.mjs — portfolio_history JSONL → MongoDB.
//
// usage:
//   pnpm exec node --env-file=.env.local scripts/ingest-portfolio.mjs [path]

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

  const Coll = mongoose.connection.collection('portfoliohistories');
  await Coll.createIndex({ env: 1, currency: 1, date: 1 }, { unique: true });
  await Coll.createIndex({ env: 1, currency: 1, dateStr: 1 });

  const inputPath = process.argv[2];
  const stream = inputPath ? fs.createReadStream(inputPath, { encoding: 'utf-8' }) : process.stdin;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let processed = 0, upserted = 0, skipped = 0;
  let ops = [];
  async function flush() {
    if (!ops.length) return;
    try {
      const r = await Coll.bulkWrite(ops, { ordered: false });
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
    try { rec = JSON.parse(trimmed); } catch { skipped++; continue; }
    processed++;
    if (!rec.env || !rec.date || !rec.dateStr) { skipped++; continue; }
    ops.push({
      updateOne: {
        filter: { env: rec.env, currency: rec.currency ?? 'KRW', date: rec.date },
        update: {
          $set: {
            env: rec.env,
            currency: rec.currency ?? 'KRW',
            date: rec.date,
            dateStr: rec.dateStr,
            totalValue: rec.totalValue,
            cash: rec.cash,
            holdingsValue: rec.holdingsValue,
            runPnl: rec.runPnl,
            cumulativePnl: rec.cumulativePnl,
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
