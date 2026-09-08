#!/usr/bin/env node
// scripts/migrate-static-scenes-to-minio.mjs
//
// Moves the PoC stage's 5 static placeholder scenes to minio and updates mongo's illustration URLs.
//
// The subjects (currently public/web-adventure/scenes/*.jpg):
//   town_square_dawn / market_morning / elder_house_arrival / forest_entry / cave_entry
//
// The flow:
//   1. public/web-adventure/scenes/*.jpg are putObject'd into the minio handmade-site bucket as
//      painter-images/web-adventure-{sceneId}-{ts}.jpg.
//   2. the illustration URL is updated through mongo's PUT /api/web-adventure/scenes/{sceneId}.
//   3. the PUT has no NextAuth protection (admin is not applied at Phase B) - it is called as it is.
//
// Usage:
//   pnpm node scripts/migrate-static-scenes-to-minio.mjs              # production
//   API_BASE=http://localhost:3010 pnpm node scripts/migrate-static-scenes-to-minio.mjs

// Environment variables: node 20+'s built-in `--env-file=.env.local`.
//   pnpm node --env-file=.env.local scripts/migrate-static-scenes-to-minio.mjs

import * as Minio from 'minio';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const API_BASE = process.env.API_BASE ?? 'https://slowmade.duckdns.org';
const PUBLIC_DIR = resolve('public/web-adventure/scenes');
const BUCKET = process.env.MINIO_BUCKET;

const TARGETS = [
  { sceneId: 'town_square_dawn', file: 'town-square-dawn.jpg' },
  { sceneId: 'market_morning', file: 'market.jpg' },
  { sceneId: 'elder_house_arrival', file: 'elder-house.jpg' },
  { sceneId: 'forest_entry', file: 'forest.jpg' },
  { sceneId: 'cave_entry', file: 'cave.jpg' },
];

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT ?? '443', 10),
  useSSL: true,
  accessKey: process.env.MINIO_ACCESSKEY,
  secretKey: process.env.MINIO_SECRETKEY,
});

async function uploadOne(t) {
  const filePath = resolve(PUBLIC_DIR, t.file);
  if (!existsSync(filePath)) {
    throw new Error(`파일 없음: ${filePath}`);
  }
  const buffer = readFileSync(filePath);
  const objectName = `painter-images/web-adventure-${t.sceneId}-${Date.now()}.jpg`;
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': 'image/jpeg',
  });
  const publicUrl = `https://${process.env.MINIO_ENDPOINT}/${BUCKET}/${objectName}`;
  return publicUrl;
}

async function updateScene(sceneId, illustrationUrl) {
  const url = `${API_BASE}/api/web-adventure/scenes/${encodeURIComponent(sceneId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ illustration: illustrationUrl }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PUT ${sceneId} → ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function main() {
  console.log(`endpoint: ${process.env.MINIO_ENDPOINT}, bucket: ${BUCKET}, api: ${API_BASE}`);
  for (const t of TARGETS) {
    process.stdout.write(`  ${t.sceneId} ... `);
    try {
      const url = await uploadOne(t);
      await updateScene(t.sceneId, url);
      console.log(`✓\n    → ${url}`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error('예외', err);
  process.exit(2);
});
