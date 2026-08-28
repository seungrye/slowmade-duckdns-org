#!/usr/bin/env node
// 야간 러너가 씬을 **읽기만** 하는 통로 (#310).
//
// 클로드가 "공중도시 붕괴 씬이 뭐냐" 를 DB 를 못 읽어 사람에게 되묻고 있었다. 그렇다고
// 원시 접속을 줄 수는 없다 — 이 DB 는 인증이 없고 posts·users·comments 가 같이 있다.
// `api.sh` 처럼 **할 수 있는 일을 못박은 래퍼**를 둔다. 셋뿐이고 전부 읽기다.
//
//   db.mjs scenes            씬 목록 (본문 제외)
//   db.mjs scene <id>        씬 하나의 본문
//   db.mjs search <문구>      제목·본문에 그 말이 든 씬
//
// **웹어드벤처 씬 계열만 본다.** 다른 컬렉션은 이 파일에 등장하지 않으므로 통로가 없다.
//
// 코더(ai-coder)는 `.env.local` 을 못 읽으므로(#294) 이 통로는 클로드 러너 전용이다.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseCommand, escapeRegex, formatScenes, formatScene, formatSearch } from './db-query.mjs';

const SITE = process.env.SITE_DIR?.trim() || '/home/seungrye/site';
const ENV_FILE = process.env.ENV_FILE?.trim() || `${SITE}/webapp/.env.local`;
/** 이 컬렉션 하나만 본다. */
const COLLECTION = 'webadventurescenes';

const die = (m) => { console.error(`\x1b[1;31m[db]\x1b[0m ${m}`); process.exit(1); };

const 명령 = parseCommand(process.argv.slice(2));
if (!명령) {
  die('사용법: db.mjs scenes | scene <id> | search <문구>');
}

let uri = '';
try {
  uri = readFileSync(ENV_FILE, 'utf8').split('\n')
    .find((l) => l.startsWith('MONGO_URI='))?.split('=').slice(1).join('=').trim()
    .replace(/^["']|["']$/g, '') ?? '';
} catch (e) {
  die(`env 파일을 못 읽었습니다(${ENV_FILE}): ${e?.message ?? e}`);
}
if (!uri) die(`MONGO_URI 가 ${ENV_FILE} 에 없습니다.`);

// mongoose 는 webapp 의 의존성이라 그쪽 기준으로 찾는다(pnpm 이라 경로가 가상 저장소다).
const require = createRequire(`${SITE}/webapp/package.json`);
const mongoose = require('mongoose');

await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
const col = mongoose.connection.db.collection(COLLECTION);
try {
  if (명령.cmd === 'scenes') {
    // 본문을 아예 안 가져온다 — 실수로도 흘리지 않게.
    const docs = await col.find({}, { projection: { id: 1, title: 1, _id: 0 } }).sort({ id: 1 }).toArray();
    console.log(formatScenes(docs));
  } else if (명령.cmd === 'scene') {
    const doc = await col.findOne({ id: 명령.arg }, { projection: { id: 1, title: 1, body: 1, _id: 0 } });
    console.log(formatScene(doc));
  } else {
    const 판 = { $regex: escapeRegex(명령.arg), $options: 'i' };
    const docs = await col.find({ $or: [{ title: 판 }, { body: 판 }] },
      { projection: { id: 1, title: 1, body: 1, _id: 0 } }).sort({ id: 1 }).toArray();
    console.log(formatSearch(docs, 명령.arg));
  }
} finally {
  await mongoose.disconnect();
}
