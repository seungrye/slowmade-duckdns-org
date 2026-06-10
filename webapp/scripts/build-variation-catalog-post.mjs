#!/usr/bin/env node
// scripts/build-variation-catalog-post.mjs — 씬 일러스트 배리에이션 카탈로그 (list view).
//
// 지정 Post(POST_ID)에 전체 80씬을 *씬별 행(list view)* 으로 정리:
//   씬 제목/id → 배리에이션 이미지들(가로 나열) → 사용된 영어 prompt.
// 향후 사용자가 직접 이미지를 업로드해 배리에이션을 늘리는 확장도 염두.
// 멱등(POST_ID 덮어쓰기).

import mongoose from 'mongoose';
import fs from 'node:fs';

const POST_ID = '6a223d76273564da366bf7da';
const TITLE = '〈에테르니아의 추락〉 씬 일러스트 배리에이션 카탈로그 (80씬 × 3)';
const AUTHOR = '안승례';
const USER_EMAIL = 'seungrye@devguru.co.kr';
const TAGS = ['web-adventure', '에테르니아의추락', '일러스트', '배리에이션'];

const overrides = JSON.parse(
  fs.readFileSync('scripts/painter-scene-english-overrides.json', 'utf8'),
);

const GROUPS = [
  { name: '카엘 (Kael)', test: (id) => id.startsWith('kael') },
  { name: '린 (Rin)', test: (id) => id.startsWith('rin') },
  { name: '솔벤 (Solwen)', test: (id) => id.startsWith('sol') },
  { name: '옴팔로스 (공통)', test: (id) => id.startsWith('omphalos') },
  { name: '클라이맥스 & 결말 (공통)', test: (id) => /^(climax|station|ending)/.test(id) },
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const txt = (s) => ({ type: 'text', text: s });

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  const Post = mongoose.model('P', new mongoose.Schema({}, { strict: false, collection: 'posts', timestamps: true }));

  const all = (await Scene.find({}).lean()).sort((a, b) => a.id.localeCompare(b.id));

  const content = [];
  const html = [];
  const urls = [];

  content.push({ type: 'heading', attrs: { level: 1, textAlign: null }, content: [txt(TITLE)] });
  html.push(`<h1>${esc(TITLE)}</h1>`);
  const intro = '전체 80씬의 일러스트를 씬당 3장(배리에이션)으로 생성한 목록입니다. 게임에서는 회차마다 배리에이션 중 하나가 결정적으로 선택됩니다. 각 씬의 사용된 영어 prompt 도 함께 표기했습니다.';
  content.push({ type: 'paragraph', attrs: { textAlign: null }, content: [txt(intro)] });
  html.push(`<p>${esc(intro)}</p>`);

  let sceneCount = 0;
  let imgCount = 0;

  for (const g of GROUPS) {
    const scenes = all.filter((s) => g.test(s.id));
    if (!scenes.length) continue;
    content.push({ type: 'heading', attrs: { level: 2, textAlign: null }, content: [txt(g.name)] });
    html.push(`<h2>${esc(g.name)}</h2>`);

    for (const s of scenes) {
      sceneCount++;
      const label = `${s.title} (${s.id})`;
      content.push({ type: 'heading', attrs: { level: 3, textAlign: null }, content: [txt(label)] });
      html.push(`<h3>${esc(label)}</h3>`);

      const imgs = s.illustrations && s.illustrations.length > 0 ? s.illustrations : (s.illustration ? [s.illustration] : []);
      // 배리에이션 이미지들을 가로로 (각 image 노드 연속).
      const htmlImgs = [];
      for (const src of imgs) {
        content.push({ type: 'image', attrs: { src, alt: s.id, title: s.id, width: null, height: null } });
        htmlImgs.push(`<img src="${esc(src)}" alt="${esc(s.id)}" title="${esc(s.id)}">`);
        urls.push({ url: src, thumbnailUrl: src });
        imgCount++;
      }
      html.push(`<p>${htmlImgs.join(' ')}</p>`);

      const prompt = overrides[s.id];
      if (prompt) {
        content.push({ type: 'paragraph', attrs: { textAlign: null }, content: [txt(`prompt: ${prompt}`)] });
        html.push(`<p>${esc(`prompt: ${prompt}`)}</p>`);
      } else {
        content.push({ type: 'paragraph', attrs: { textAlign: null } });
        html.push('<p></p>');
      }
    }
  }

  const doc = {
    title: TITLE,
    htmlContent: html.join('\n'),
    jsonContent: { type: 'doc', content },
    urls,
    author: AUTHOR,
    userEmail: USER_EMAIL,
    tags: TAGS,
    isDeleted: false,
  };

  const existing = await Post.findById(POST_ID).lean();
  if (existing) {
    await Post.updateOne({ _id: POST_ID }, { $set: doc });
    console.log('업데이트: 기존 post', POST_ID);
  } else {
    console.warn('경고: POST_ID 없음 — 새로 생성');
    await Post.create({ _id: POST_ID, ...doc });
  }
  console.log(`  씬 ${sceneCount} / 이미지 ${imgCount}장`);
  console.log(`  URL: https://slowmade.duckdns.org/post/view/${POST_ID}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
