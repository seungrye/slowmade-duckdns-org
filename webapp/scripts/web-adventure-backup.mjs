#!/usr/bin/env node
// scripts/web-adventure-backup.mjs - #279's regular backup of the web-adventure mongo collections.
//
// Called before a seed change (running any seed-*.mjs), or from cron. Kept at:
//   scripts/backups/web-adventure-YYYY-MM-DDTHH-MM-SS.json
//
// Automatic rotation: only the most recent 20 are kept (older files are deleted automatically).
//
// Usage:
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

  // The rotation - only the most recent KEEP_LATEST are kept.
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
