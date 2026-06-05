#!/usr/bin/env node
// scripts/backup-web-adventure-scenes.mjs — 기존 web-adventure 콘텐츠 백업.
//
// 〈에테르니아의 추락〉 리프래시 (#253) 전, 기존 한국 사극 톤 30 씬을
// JSON 파일로 보관. 이후 mongo 컬렉션 비우고 새 세계관 적치.
// 보관 위치: scripts/backups/web-adventure-pre-aethernia-{ts}.json
//
// 사용:
//   node --env-file=.env.local scripts/backup-web-adventure-scenes.mjs

import mongoose from 'mongoose';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'WebAdventureScene',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );
  const scenes = await Scene.find({}).lean();
  console.log(`fetched ${scenes.length} scenes`);

  const dir = resolve('scripts/backups');
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = resolve(dir, `web-adventure-pre-aethernia-${ts}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        backedUpAt: new Date().toISOString(),
        sceneCount: scenes.length,
        scenes,
      },
      null,
      2,
    ),
  );
  console.log(`saved ${file}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
