// 기존 롬·패치·부모셋에 sha256 을 채운다 (#188).
//
// netplay 방 번호를 **코어가 실제로 읽는 바이트**로 묶으려면 해시가 있어야 한다. 업로드
// 라우트는 이제 저장 시점에 떠 두지만, 그 전에 올린 것들은 비어 있다. 해시가 없는 롬은
// netplay 진입이 감춰지므로(엉뚱한 방에 붙어 desync 나느니 낫다) 한 번 채워 준다.
//
// 사용:
//   cd ~/site/webapp && node ../scripts/games/backfill-rom-hashes.mjs          # 확인만
//   cd ~/site/webapp && node ../scripts/games/backfill-rom-hashes.mjs --write  # 실제 기록
//
// **멱등하다** — 이미 있는 해시는 건드리지 않는다. 읽기 전용으로 먼저 돌려 보고 쓰는 걸 권한다.
// 삭제된(soft delete) 항목도 채운다. 되살렸을 때 바로 쓸 수 있어야 한다.

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

/** 오브젝트를 흘려 읽으며 sha256 을 뜬다 — 큰 아케이드 롬(수십 MB)을 통째로 메모리에 올리지 않는다. */
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

  // ── 롬 본체
  checked++;
  if (rom.sha256) {
    skipped++;
  } else if (rom.objectKey) {
    try {
      const { sha256, size } = await hashObject(rom.objectKey);
      // 기록된 크기와 실제가 다르면 엉뚱한 오브젝트를 읽은 것이다 — 그대로 쓰면 안 된다.
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

  // ── 패치들
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

  // ── 부모 롬셋들
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
