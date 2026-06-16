#!/usr/bin/env node
// scripts/update-stock-names.mjs — JSONL {ticker, name} → stocks.name 갱신.
//
// usage:
//   pnpm exec node --env-file=.env.local scripts/update-stock-names.mjs [path]

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

  const Stocks = mongoose.connection.collection('stocks');

  const inputPath = process.argv[2];
  const stream = inputPath ? fs.createReadStream(inputPath, { encoding: 'utf-8' }) : process.stdin;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let processed = 0, updated = 0, skipped = 0;
  let ops = [];
  async function flush() {
    if (!ops.length) return;
    try {
      const r = await Stocks.bulkWrite(ops, { ordered: false });
      updated += r.modifiedCount ?? 0;
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
    if (!rec.ticker || !rec.name) { skipped++; continue; }
    // name 이 ticker 와 동일하거나 의미 없는 placeholder 일 때만 갱신하지 않고,
    // 항상 최신 name 으로 덮어쓰기. seed 의 placeholder 도 자동 교체.
    ops.push({
      updateOne: {
        filter: { ticker: rec.ticker },
        update: { $set: { name: rec.name }, $currentDate: { updatedAt: true } },
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();
  console.log(`✅ done: processed=${processed} updated=${updated} skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
