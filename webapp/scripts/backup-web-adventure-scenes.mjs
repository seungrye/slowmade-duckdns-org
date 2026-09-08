#!/usr/bin/env node
// scripts/backup-web-adventure-scenes.mjs - backing up the existing web-adventure content.
//
// Before The Fall of Eternia's refresh (#253), the existing 30 scenes in the Korean historical-drama tone
// are kept as a JSON file. The mongo collection is then emptied and the new setting loaded.
// Kept at: scripts/backups/web-adventure-pre-aethernia-{ts}.json
//
// Usage:
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
