#!/usr/bin/env node
// scripts/build-worldbuilding-post.mjs — 세계관 & 이미지 생성 가이드 Post.
//
// 〈에테르니아의 추락〉 세계관을 *이미지 생성 일관성* 관점으로 정리.
//   - 전체 비주얼 스타일(공통 prompt suffix)
//   - 세력/장소별 비주얼 모티프 + 영어 키워드
//   - 핵심 사물의 비주얼
// 다음 이미지 생성 때 [공통 스타일 + 해당 장소 모티프 + 등장 사물] 을 prompt 에
// 넣어 일관성 확보. 멱등(같은 title update).

import mongoose from 'mongoose';

const TITLE = '〈에테르니아의 추락〉 세계관 & 이미지 생성 가이드';
const AUTHOR = '안승례';
const USER_EMAIL = 'seungrye@devguru.co.kr';
const TAGS = ['web-adventure', '에테르니아의추락', '세계관', '이미지가이드'];

// 공통 스타일 (모든 씬 prompt 에 붙는 suffix).
const STYLE_SUFFIX =
  'dark epic fantasy, steel and steam, celestial magitech, cold blue glow, black smoke, 16-bit RPG dot pixel art, no characters, no people';

// 문서 구조 — 순서대로 노드 생성.
const DOC = [
  { h: 1, t: TITLE },
  {
    p: '〈에테르니아의 추락〉의 세계관을 *이미지 생성 일관성* 관점으로 정리한 문서입니다. 다음에 씬 일러스트를 생성할 때, 아래의 [공통 비주얼 스타일] + [해당 장소의 모티프] + [등장하는 핵심 사물] 키워드를 prompt 에 함께 넣으면 톤이 흔들리지 않습니다.',
  },

  { h: 2, t: '0. 공통 비주얼 스타일 (모든 씬)' },
  { p: '모든 일러스트는 16비트 RPG 도트 픽셀 아트 + 천체 마법공학 다크 판타지 톤. 인물·신체는 그리지 않고 *환경/소품* 만 (배경 일러스트 스타일). 아래 영어 키워드를 prompt 끝에 항상 붙입니다.' },
  { code: STYLE_SUFFIX },
  { p: '핵심 색감: *차가운 푸른 빛*(에테르 마력) + *검은 연기*(가솔린 문명) + *강철/녹*. 따뜻한 색은 위기/화염 장면에만.' },

  { h: 2, t: '1. 세계 개요' },
  { p: '부유도시 **솔라리스**는 *에테르 가솔린* — 마력석을 정제한 액체 마력 — 으로 하늘에 떠 있다. 마력의 원천은 지상의 **세계수**. **사제단**은 *세 달이 정렬*하는 마지막 사흘, 지상의 모든 생명을 연료로 태워 *신계로 승천*하려 한다. 강철과 증기의 **아이언가드**는 새 시대를, 잠든 **영수**(사슴 형상 자연 정령)는 숲의 귀환을 꿈꾼다.' },
  { p: '종말의 시계는 *세 달의 정렬*. 세 주인공이 같은 종말을 향해 각자의 길을 걷는다.' },

  { h: 2, t: '2. 핵심 개념 & 비주얼' },
  { h: 3, t: '에테르 가솔린 / 마력석' },
  { p: '마력석을 정제한 *푸른빛 액체 마력*. 노란 라벨의 통에 담겨 열차로 운송된다. 진실은 — *성흔체의 결정 코어를 적출*해 만든 것. 부유도시의 동력이자 사제단 의식의 점화기.' },
  { bullets: ['blue glowing liquid / crystal, gasoline barrels with yellow labels, blue crystal shards, ether vapor'] },
  { h: 3, t: '성흔 침식 (Stigma Erosion)' },
  { p: '마력을 다룬 자의 몸에 *푸른 결정*이 자라난다. 손목·관절부터 굳어가며, 100에 이르면 완전히 *석화*되어 마력석이 된다. 시한부의 카운트다운.' },
  { bullets: ['blue crystal cracks spreading on a surface, petrification, cold crystalline growth (단, 신체 직접 묘사는 피하고 결정/균열 질감으로)'] },
  { h: 3, t: '사제단 & 세 달' },
  { p: '은빛 가면의 사제단. 솔라리스 첨탑 위에서 *세 달 정렬* 새벽에 의식을 행한다. 인장은 은빛으로 빛난다.' },
  { bullets: ['three aligned moons in a dark sky, silver masked cult sigil, towering spire, ritual blue light'] },
  { h: 3, t: '세계수 & 영수' },
  { p: '지상 마력의 원천인 거대한 세계수. 그 곁의 *흰 뿔 영수*(사슴 형상 정령)는 침묵 속에 잠들어 있다.' },
  { bullets: ['giant world tree, mossy ancient forest, a white antler/horn of a spirit beast, faint green-blue glow'] },

  { h: 2, t: '3. 세 세력' },
  { h: 3, t: '솔라리스 제국 (Kael)' },
  { p: '하늘의 부유도시. 마법공학·사제단. 차가운 강철과 푸른 결정, 가스등. *의무동/실험실/정제소*가 무대.' },
  { bullets: ['floating city spires, cold steel facility, blue crystals, gaslight, magitech panels'] },
  { h: 3, t: '아이언가드 공국 (Rin)' },
  { p: '강철과 증기의 지상 세력. 혁명을 꿈꾼다. *검은 연기의 항만, 광산, 호송 열차, 망치꾼*.' },
  { bullets: ['black-smoke harbor, shipping containers, cranes, rusted iron, steam pipes, hammers, mine shafts'] },
  { h: 3, t: '네오엘프 자치령 (Solwen)' },
  { p: '세계수를 지키는 정령 마법사들. *안개 낀 숲, 이끼, 영수*. 인간의 가솔린 사냥에 맞선다.' },
  { bullets: ['misty ancient forest, moss, world tree roots, white antler spirit beast, sylvan bow, glowing herbs'] },

  { h: 2, t: '4. 주요 장소별 비주얼 레퍼런스' },
  { p: '특정 장소에서 벌어지는 씬은 아래 *장소 공통 키워드* 를 함께 넣어 일관성을 유지합니다.' },
  { h: 3, t: '솔라리스 의무동 / 실험실 (kael_*)' },
  { code: 'cold dark infirmary / laboratory, metal medical beds, frosted glass doors, blue mana crystals, gaslight, ether vapor, sterile steel, ' + STYLE_SUFFIX },
  { h: 3, t: '검은 연기의 항만 (rin_harbor, rin_evidence_*)' },
  { code: 'black-smoke harbor at night, old shipping containers, harbor crane, rusted metal, wet asphalt, blue crystal smuggling crates, fog, ' + STYLE_SUFFIX },
  { h: 3, t: '아이언가드 본부 / 지하 (rin_betrayal_*, rin_underground_*)' },
  { code: 'grim headquarters interior, cold metal corridors, steam pipes, iron doors, ventilation ducts, dim lighting, ' + STYLE_SUFFIX },
  { h: 3, t: '세계수 숲 (solwen_*)' },
  { code: 'ancient world-tree forest, mossy ground, mist, dry grass, white antler spirit horn, faint glow, dusk, (불 장면은 red flames + black smoke 추가) ' + STYLE_SUFFIX },
  { h: 3, t: '옴팔로스 — 중립 도시 (omphalos_*)' },
  { code: 'the neutral city Omphalos, distant spires, black steel train station, chain-link fences, black market tents, gaslamps, fog, ' + STYLE_SUFFIX },
  { h: 3, t: '외곽 — 폐기물 처리장 / 광산 (kael_wreckage_*, omphalos_hoffmann_*)' },
  { code: 'scrapyard / wasteland on the city outskirts, rusted containers, discarded wreckage, blue crystal dust, mine shaft entrance, lantern, fog, ' + STYLE_SUFFIX },
  { h: 3, t: '가솔린 열차 & 클라이맥스 (omphalos_station, climax_*, station_*)' },
  { code: 'a black steel gasoline train, cargo cars full of barrels, a glowing blue ether core, railway junction, sparks, derailment debris, ' + STYLE_SUFFIX },

  { h: 2, t: '5. 핵심 사물 비주얼' },
  { bullets: [
    '에테르 가솔린 통 — gasoline barrel with a yellow label, blue liquid',
    '마력석 파편 — a glowing blue crystal fragment',
    '정제수 — a vial of luminous blue refined water',
    '사제단 인장 — a silver glowing cult sigil',
    '수사관 휘장 — an imperial investigator badge',
    '권총 — an old service revolver (가솔린 탄)',
    '영수 활 — a bow carved from world-tree branch',
    '영수 깃털 — a faintly glowing spirit-beast feather',
  ] },

  { h: 2, t: '6. 6 엔딩의 톤 (결말 일러스트용)' },
  { bullets: [
    '✨ 승천(ascension) — 은빛 사제단, 세 달, 첨탑 정점, 차가운 영광',
    '⚙️ 혁명(revolution) — 부서진 솔라리스 첨탑, 망치꾼, 검은 연기, 강철의 새 시대',
    '☯ 조화(harmony) — 다시 흐르는 마력, 세계수의 노래, 옅어지는 푸른 빛',
    '💀 추락(fall) — 잿더미가 된 세계, 무너진 첨탑, 새벽 없는 하늘, 한 줄기 푸른 풀잎',
    '🗿 석화(petrification) — 푸른 결정이 된 몸, 등불이 된 빛',
    '🌿 정령의 결속(sylvan_bond) — 솟아오른 세계수 뿌리, 이끼로 돌아간 강철, 깨어난 영수',
  ] },

  { p: '— 이 문서는 스토리 바이블(docs/spec/web-mud/aethernia-story.md)과 기존 씬 본문에서 추출·정리한 것입니다. 설정 오류나 보강할 장소/사물이 있으면 알려주세요.' },
];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const txt = (s) => ({ type: 'text', text: s });

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Post = mongoose.model('P', new mongoose.Schema({}, { strict: false, collection: 'posts', timestamps: true }));

  const content = [];
  const html = [];

  for (const node of DOC) {
    if (node.h) {
      content.push({ type: 'heading', attrs: { level: node.h, textAlign: null }, content: [txt(node.t)] });
      html.push(`<h${node.h}>${esc(node.t)}</h${node.h}>`);
    } else if (node.p) {
      content.push({ type: 'paragraph', attrs: { textAlign: null }, content: [txt(node.p)] });
      html.push(`<p>${esc(node.p)}</p>`);
    } else if (node.code) {
      content.push({
        type: 'codeBlock',
        attrs: { language: null },
        content: [txt(node.code)],
      });
      html.push(`<pre><code>${esc(node.code)}</code></pre>`);
    } else if (node.bullets) {
      content.push({
        type: 'bulletList',
        content: node.bullets.map((b) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', attrs: { textAlign: null }, content: [txt(b)] }],
        })),
      });
      html.push('<ul>' + node.bullets.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>');
    }
  }

  const doc = {
    title: TITLE,
    htmlContent: html.join('\n'),
    jsonContent: { type: 'doc', content },
    urls: [],
    author: AUTHOR,
    userEmail: USER_EMAIL,
    tags: TAGS,
    version: 1,
    isDeleted: false,
  };

  const existing = await Post.findOne({ title: TITLE, isDeleted: { $ne: true } }).lean();
  let id;
  if (existing) {
    await Post.updateOne({ _id: existing._id }, { $set: doc });
    id = existing._id;
    console.log('업데이트: 기존 세계관 Post 덮어쓰기');
  } else {
    const created = await Post.create(doc);
    id = created._id;
    console.log('생성: 새 세계관 Post');
  }
  console.log('  노드 수:', content.length);
  console.log('  URL: https://slowmade.duckdns.org/post/view/' + id);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
