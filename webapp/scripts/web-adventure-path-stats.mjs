#!/usr/bin/env node
// scripts/web-adventure-path-stats.mjs — 회차 경로(씬 시퀀스) 분포 집계.
//
// past-run 의 scenePath(시작→종료 거쳐간 씬 id 시퀀스) 를 묶어, 어떤 경로로
// 진행한 케이스가 많은지 분석. (단일 씬 접근 횟수가 아니라 *전체 경로* 빈도.)
// scenePath 는 #(이 커밋) 이후 회차부터 수집되므로, 그 전 데이터엔 경로가 없다.
//
// 사용:
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

  // 1) 전체 경로 시퀀스 빈도 (주인공 + 경로 + 엔딩 단위)
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

  // 2) 경로 길이 분포
  console.log('\n=== 경로 길이(거쳐간 씬 수) 분포 ===');
  for (const [len, n] of [...lenBuckets.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${len}개 씬: ${n}회`);
  }

  // 3) 첫 분기(시작 씬 다음) 선호 — 시작 직후 어디로 가는지
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
