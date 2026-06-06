#!/usr/bin/env node
// scripts/web-adventure-backup.mjs — #279 web-adventure mongo 컬렉션 정기 백업.
//
// 시드 변경 (각 seed-*.mjs 실행) 전 또는 cron 으로 호출. 보관 위치:
//   scripts/backups/web-adventure-YYYY-MM-DDTHH-MM-SS.json
//
// 자동 회전: 최근 20 개만 유지 (오래된 파일 자동 삭제).
//
// 사용:
//   MONGO_URI=mongodb://127.0.0.1:27017/handmade-site node scripts/web-adventure-backup.mjs

import mongoose from 'mongoose';
import { writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { resolve, join } from 'path';

const KEEP_LATEST = 20;

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI 필요');
    process.exit(2);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'BackupScene',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );
  const all = await Scene.find({}).lean();

  const dir = resolve(process.cwd(), 'scripts/backups');
  mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `web-adventure-${ts}.json`);
  writeFileSync(file, JSON.stringify(all, null, 2));
  console.log(`✓ backup → ${file} (${all.length} 씬)`);

  // 회전 — 최근 KEEP_LATEST 개만 유지.
  const backups = readdirSync(dir)
    .filter((f) => f.startsWith('web-adventure-') && f.endsWith('.json'))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  const toDelete = backups.slice(KEEP_LATEST);
  for (const { f } of toDelete) {
    unlinkSync(join(dir, f));
    console.log(`  rotated out: ${f}`);
  }
  console.log(`  kept: ${Math.min(backups.length, KEEP_LATEST)} / 최근`);

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
