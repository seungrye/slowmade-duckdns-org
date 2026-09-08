#!/usr/bin/env node
// scripts/update-stock-names.mjs - a JSONL {ticker, name} -> updating stocks.name.
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
    // Rather than updating only when the name equals the ticker or is a meaningless placeholder,
    // it always overwrites with the latest name. The seed's placeholders are replaced automatically too.
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
