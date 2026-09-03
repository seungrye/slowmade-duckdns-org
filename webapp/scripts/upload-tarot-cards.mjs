#!/usr/bin/env node
/**
 * RWS 타로 78장을 MinIO 로 업로드한다 (#388).
 *
 * 원화는 퍼블릭 도메인(라이더-웨이트-스미스, 1909, Pamela Colman Smith). Wikimedia Commons 에서
 * 받아 MinIO `tarot/rws/{id}.jpg` 로 올린다 — 덱의 image 키(tarot-deck.ts)와 정확히 맞춘다.
 * public-read 버킷이라 buildPublicUrl 로 바로 서빙된다(프록시 불필요).
 *
 * 실행(node 20+ 내장 env 로더):
 *   node --env-file=.env.local scripts/upload-tarot-cards.mjs           # 미리보기(다운로드 없음)
 *   node --env-file=.env.local scripts/upload-tarot-cards.mjs --apply   # 실제 다운로드+업로드
 *   ... --force   # 이미 있어도 다시 올린다
 */
import * as Minio from 'minio';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const BUCKET = process.env.MINIO_BUCKET;
const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';

// 메이저 22 — Wikimedia RWS 파일명(정확).
const MAJOR = [
  'RWS_Tarot_00_Fool.jpg', 'RWS_Tarot_01_Magician.jpg', 'RWS_Tarot_02_High_Priestess.jpg',
  'RWS_Tarot_03_Empress.jpg', 'RWS_Tarot_04_Emperor.jpg', 'RWS_Tarot_05_Hierophant.jpg',
  'RWS_Tarot_06_Lovers.jpg', 'RWS_Tarot_07_Chariot.jpg', 'RWS_Tarot_08_Strength.jpg',
  'RWS_Tarot_09_Hermit.jpg', 'RWS_Tarot_10_Wheel_of_Fortune.jpg', 'RWS_Tarot_11_Justice.jpg',
  'RWS_Tarot_12_Hanged_Man.jpg', 'RWS_Tarot_13_Death.jpg', 'RWS_Tarot_14_Temperance.jpg',
  'RWS_Tarot_15_Devil.jpg', 'RWS_Tarot_16_Tower.jpg', 'RWS_Tarot_17_Star.jpg',
  'RWS_Tarot_18_Moon.jpg', 'RWS_Tarot_19_Sun.jpg', 'RWS_Tarot_20_Judgement.jpg',
  'RWS_Tarot_21_World.jpg',
];
// 마이너 56 — Wikimedia 파일명은 {Suit}{NN}.jpg (Ace=01 … King=14). pentacles→Pents.
const SUIT_FILE = { wands: 'Wands', cups: 'Cups', swords: 'Swords', pentacles: 'Pents' };
const SUIT_ORDER = ['wands', 'cups', 'swords', 'pentacles'];

// 덱의 id 순서(tarot-deck.ts 와 동일): 메이저 0-21 → 수트별 1-14.
function sourceFor(id) {
  if (id < 22) return MAJOR[id];
  const k = id - 22;
  const suit = SUIT_ORDER[Math.floor(k / 14)];
  const rank = (k % 14) + 1;
  return `${SUIT_FILE[suit]}${String(rank).padStart(2, '0')}.jpg`;
}

const TARGETS = Array.from({ length: 78 }, (_, id) => ({
  id, key: `tarot/rws/${id}.jpg`, src: COMMONS + sourceFor(id),
}));

if (!BUCKET) { console.error('MINIO_BUCKET 미설정 — --env-file=.env.local 로 실행하세요.'); process.exit(1); }

const minio = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT ?? '443', 10),
  useSSL: true,
  accessKey: process.env.MINIO_ACCESSKEY,
  secretKey: process.env.MINIO_SECRETKEY,
});

async function fetchWithBackoff(url, tries = 5) {
  let wait = 2000;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'slowmade-tarot/1.0 (personal site; contact seungrye)' } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, wait)); wait = Math.min(wait * 2, 20000); continue;
    }
    throw new Error(`fetch ${res.status}`);
  }
  throw new Error('fetch 429 (재시도 소진)');
}

async function exists(key) {
  try { await minio.statObject(BUCKET, key); return true; } catch { return false; }
}

console.log(`RWS 78장 → MinIO ${BUCKET}/tarot/rws/  (${APPLY ? '적용' : '미리보기'}${FORCE ? ' · force' : ''})`);
if (!APPLY) {
  for (const t of TARGETS.slice(0, 3)) console.log(`  #${t.id} ← ${t.src}`);
  console.log(`  … 총 ${TARGETS.length}장. 실제로 올리려면 --apply.`);
  process.exit(0);
}

let up = 0, skip = 0, fail = 0;
for (const t of TARGETS) {
  try {
    if (!FORCE && (await exists(t.key))) { skip++; continue; }
    const buf = await fetchWithBackoff(t.src);
    await minio.putObject(BUCKET, t.key, buf, buf.length, { 'Content-Type': 'image/jpeg' });
    up++;
    console.log(`  ✓ #${t.id} (${(buf.length / 1024).toFixed(0)}KB) ${sourceFor(t.id)}`);
    await new Promise((r) => setTimeout(r, 1500)); // Wikimedia 예의상 간격
  } catch (e) {
    fail++;
    console.error(`  ✗ #${t.id} ${sourceFor(t.id)}: ${e.message}`);
  }
}
console.log(`\n완료 — 업로드 ${up} · 스킵 ${skip} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
