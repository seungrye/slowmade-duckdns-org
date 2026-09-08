// Fills in sha256 for the existing roms, patches and parent sets (#188).
//
// Grouping netplay rooms by **the bytes the core actually reads** needs the hash. The upload
// route now takes it at save time, but anything uploaded before that is empty. A rom without a hash
// has its netplay entry hidden (better than joining the wrong room and desyncing), so it is filled in once.
//
// Usage:
//   cd ~/site/webapp && node ../scripts/games/backfill-rom-hashes.mjs          # check only
//   cd ~/site/webapp && node ../scripts/games/backfill-rom-hashes.mjs --write  # actually write
//
// **It is idempotent** - an existing hash is left alone. Running it read-only first is recommended.
// Soft-deleted entries are filled in too. They must be usable the moment they are restored.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import mongoose from 'mongoose';
import * as Minio from 'minio';

const WRITE = process.argv.includes('--write');

const envText = fs.readFileSync('.env.local', 'utf8');
const envOf = (k) => (envText.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '') ?? '';

const minio = new Minio.Client({
  endPoint: envOf('MINIO_ENDPOINT'),
  port: Number(envOf('MINIO_PORT') || 443),
  useSSL: true,
  accessKey: envOf('MINIO_ACCESSKEY'),
  secretKey: envOf('MINIO_SECRETKEY'),
});
const BUCKET = envOf('MINIO_BUCKET');

/** Streams the object and takes its sha256 - a large arcade rom (tens of MB) never goes into memory whole. */
async function hashObject(objectKey) {
  const stream = await minio.getObject(BUCKET, objectKey);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of stream) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest('hex'), size };
}

await mongoose.connect(envOf('MONGO_URI'));
const roms = mongoose.connection.db.collection('retroroms');

let checked = 0;
let filled = 0;
let skipped = 0;
const problems = [];

for (const rom of await roms.find({}).toArray()) {
  const set = {};
  const label = `${rom.title} (${rom.filename})`;

  // -- the rom itself
  checked++;
  if (rom.sha256) {
    skipped++;
  } else if (rom.objectKey) {
    try {
      const { sha256, size } = await hashObject(rom.objectKey);
      // A recorded size differing from the real one means the wrong object was read - it must not be used.
      if (rom.size && size !== rom.size) {
        problems.push(`${label}: 크기 불일치(문서 ${rom.size} / 실제 ${size}) — 건너뜀`);
      } else {
        set.sha256 = sha256;
        filled++;
      }
    } catch (err) {
      problems.push(`${label}: 롬 읽기 실패 — ${err.message}`);
    }
  }

  // -- the patches
  for (let i = 0; i < (rom.patches ?? []).length; i++) {
    const p = rom.patches[i];
    checked++;
    if (p.sha256) { skipped++; continue; }
    try {
      const { sha256 } = await hashObject(p.objectKey);
      set[`patches.${i}.sha256`] = sha256;
      filled++;
    } catch (err) {
      problems.push(`${label} 패치 ${p.name}: 읽기 실패 — ${err.message}`);
    }
  }

  // -- the parent rom sets
  for (let i = 0; i < (rom.parentSets ?? []).length; i++) {
    const ps = rom.parentSets[i];
    checked++;
    if (ps.sha256) { skipped++; continue; }
    try {
      const { sha256 } = await hashObject(ps.objectKey);
      set[`parentSets.${i}.sha256`] = sha256;
      filled++;
    } catch (err) {
      problems.push(`${label} 부모셋 ${ps.name}: 읽기 실패 — ${err.message}`);
    }
  }

  if (Object.keys(set).length) {
    console.log(`  ${WRITE ? '기록' : '예정'}: ${label} — ${Object.keys(set).join(', ')}`);
    if (WRITE) await roms.updateOne({ _id: rom._id }, { $set: set });
  }
}

console.log(`\n  대상 ${checked}건 · ${WRITE ? '기록' : '기록 예정'} ${filled}건 · 이미 있음 ${skipped}건`);
if (problems.length) {
  console.log('  ⚠ 문제:');
  for (const p of problems) console.log(`     ${p}`);
}
if (!WRITE) console.log('  (확인만 했습니다. 실제로 쓰려면 --write)');

await mongoose.disconnect();
