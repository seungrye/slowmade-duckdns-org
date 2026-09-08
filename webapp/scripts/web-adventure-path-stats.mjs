#!/usr/bin/env node
// scripts/web-adventure-path-stats.mjs - the distribution of run paths (scene sequences).
//
// It groups past-runs' scenePath (the sequence of scene ids passed from start to end) and analyses which paths
// were taken most. (The frequency of *whole paths*, not how often a single scene was visited.)
// scenePath is collected only from the runs after #(this commit), so earlier data has no path.
//
// Usage:
//   node --env-file=.env.local scripts/web-adventure-path-stats.mjs
//   node --env-file=.env.local scripts/web-adventure-path-stats.mjs --top=30

import mongoose from 'mongoose';

const TOP = (() => {
  const a = process.argv.find((x) => x.startsWith('--top='));
  return a ? Math.max(1, parseInt(a.slice('--top='.length), 10) || 20) : 20;
})();

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection('webadventurepastruns');

  const total = await col.countDocuments();
  const withPath = await col.countDocuments({ scenePath: { $exists: true, $ne: [] } });
  console.log(`총 회차 ${total.toLocaleString()} / 경로 보유 ${withPath.toLocaleString()}\n`);
  if (withPath === 0) {
    console.log('경로 데이터가 아직 없습니다. (이번 커밋 이후 플레이된 회차부터 수집됩니다.)');
    await mongoose.disconnect();
    return;
  }

  const runs = await col
    .find(
      { scenePath: { $exists: true, $ne: [] } },
      { projection: { scenePath: 1, endingId: 1, 'character.protagonist': 1 } },
    )
    .toArray();

  // 1) the frequency of whole path sequences (by protagonist, path and ending)
  const freq = new Map();
  const lenBuckets = new Map();
  for (const r of runs) {
    const prot = r.character?.protagonist ?? '?';
    const key = `[${prot}] ${r.scenePath.join(' → ')} ⇒ ${r.endingId}`;
    freq.set(key, (freq.get(key) ?? 0) + 1);
    const len = r.scenePath.length;
    lenBuckets.set(len, (lenBuckets.get(len) ?? 0) + 1);
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);
  console.log(`=== 가장 많이 진행된 경로 Top ${TOP} ===`);
  for (const [path, n] of sorted) {
    const pct = ((n / withPath) * 100).toFixed(1);
    console.log(`  ${n}회 (${pct}%)  ${path}`);
  }

  // 2) the distribution of path lengths
  console.log('\n=== 경로 길이(거쳐간 씬 수) 분포 ===');
  for (const [len, n] of [...lenBuckets.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${len}개 씬: ${n}회`);
  }

  // 3) the first branch's preference (after the starting scene) - where people go right away
  const secondStep = new Map();
  for (const r of runs) {
    if (r.scenePath.length >= 2) {
      const k = `${r.scenePath[0]} → ${r.scenePath[1]}`;
      secondStep.set(k, (secondStep.get(k) ?? 0) + 1);
    }
  }
  console.log('\n=== 시작 직후 첫 이동 Top 10 ===');
  for (const [k, n] of [...secondStep.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${n}회  ${k}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
