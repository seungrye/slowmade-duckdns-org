#!/usr/bin/env node
// scripts/build-illust-catalog-post.mjs — 씬 일러스트 카탈로그 Post 생성.
//
// 전체 80 씬의 [제목 + (사용된 영어 prompt) + 이미지] 를 주인공별로 묶어
// 하나의 Post(TipTap doc jsonContent + htmlContent)로 발행한다.
//   - prompt 는 이번 생성분(english-overrides)만 보유 → 나머지는 제목+이미지만.
// 멱등: 같은 title Post 가 있으면 update(덮어쓰기), 없으면 create.

import mongoose from 'mongoose';
import fs from 'node:fs';

const TITLE = '〈에테르니아의 추락〉 씬 일러스트 카탈로그 (80씬)';
const AUTHOR = '안승례';
const USER_EMAIL = 'seungrye@devguru.co.kr';
const TAGS = ['web-adventure', '에테르니아의추락', '일러스트', '카탈로그'];

const overrides = JSON.parse(
  fs.readFileSync('scripts/painter-scene-english-overrides.json', 'utf8'),
);

const GROUPS = [
  { name: '카엘 (Kael) — 솔라리스 제국 탈영병', test: (id) => id.startsWith('kael') },
  { name: '린 (Rin) — 아이언가드 공국 수사관', test: (id) => id.startsWith('rin') },
  { name: '솔벤 (Solwen) — 네오엘프 자치령 옥수', test: (id) => id.startsWith('sol') },
  { name: '옴팔로스 — 중립 도시 (공통)', test: (id) => id.startsWith('omphalos') },
  { name: '클라이맥스 & 6 결말 (공통)', test: (id) => /^(climax|station|ending)/.test(id) },
];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function txt(s) {
  return { type: 'text', text: s };
}
function heading(level, s) {
  return { type: 'heading', attrs: { level, textAlign: null }, content: [txt(s)] };
}
function paragraph(s) {
  return s
    ? { type: 'paragraph', attrs: { textAlign: null }, content: [txt(s)] }
    : { type: 'paragraph', attrs: { textAlign: null } };
}
function image(src, label) {
  return {
    type: 'image',
    attrs: { src, alt: label, title: label, width: null, height: null },
  };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'S',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );
  const Post = mongoose.model(
    'P',
    new mongoose.Schema({}, { strict: false, collection: 'posts', timestamps: true }),
  );

  const all = (await Scene.find({}).lean()).sort((a, b) => a.id.localeCompare(b.id));

  const content = []; // jsonContent.content
  const html = []; // htmlContent 조각
  const urls = []; // {url, thumbnailUrl}

  // 인트로
  content.push(heading(1, TITLE));
  html.push(`<h1>${esc(TITLE)}</h1>`);
  const intro =
    '웹 어드벤처 〈에테르니아의 추락〉 전체 80 씬의 일러스트 모음입니다. ' +
    '이미지는 16비트 RPG 도트 픽셀 아트 스타일로 자동 생성했고, ' +
    '이번에 새로 생성한 씬은 실제 사용된 영어 prompt 를 함께 표기했습니다. ' +
    '(기존 씬은 prompt 기록이 없어 제목과 이미지만 표시합니다.)';
  content.push(paragraph(intro));
  html.push(`<p>${esc(intro)}</p>`);

  let promptCount = 0;
  let imgCount = 0;

  for (const g of GROUPS) {
    const scenes = all.filter((s) => g.test(s.id));
    if (!scenes.length) continue;

    content.push(heading(2, g.name));
    html.push(`<h2>${esc(g.name)}</h2>`);

    for (const s of scenes) {
      const label = `${s.title} (${s.id})`;
      content.push(heading(3, label));
      html.push(`<h3>${esc(label)}</h3>`);

      if (s.illustration) {
        content.push(image(s.illustration, s.id));
        html.push(
          `<img src="${esc(s.illustration)}" alt="${esc(s.id)}" title="${esc(s.id)}">`,
        );
        urls.push({ url: s.illustration, thumbnailUrl: s.illustration });
        imgCount++;
      }

      const prompt = overrides[s.id];
      if (prompt) {
        const line = `prompt: ${prompt}`;
        content.push(paragraph(line));
        html.push(`<p>${esc(line)}</p>`);
        promptCount++;
      } else {
        content.push(paragraph(''));
        html.push('<p></p>');
      }
    }
  }

  const jsonContent = { type: 'doc', content };
  const htmlContent = html.join('\n');

  const doc = {
    title: TITLE,
    htmlContent,
    jsonContent,
    urls,
    author: AUTHOR,
    userEmail: USER_EMAIL,
    tags: TAGS,
    version: 1,
    isDeleted: false,
  };

  const existing = await Post.findOne({ title: TITLE, isDeleted: { $ne: true } }).lean();
  let saved;
  if (existing) {
    await Post.updateOne({ _id: existing._id }, { $set: doc });
    saved = existing._id;
    console.log('업데이트: 기존 카탈로그 Post 덮어쓰기');
  } else {
    const created = await Post.create(doc);
    saved = created._id;
    console.log('생성: 새 카탈로그 Post');
  }

  console.log(`  씬 ${imgCount}개 / prompt 표기 ${promptCount}개`);
  console.log(`  Post _id: ${saved}`);
  console.log(`  URL: https://slowmade.duckdns.org/post/${saved}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
