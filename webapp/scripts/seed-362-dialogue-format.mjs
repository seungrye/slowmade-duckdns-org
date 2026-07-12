#!/usr/bin/env node
// scripts/seed-362-dialogue-format.mjs — 씬 텍스트 서식 일원화 정정 patch.
//
// 규약(src/content/web-adventure/FORMAT.md):
//   대사는 순수 "..."(자동 호박색) — *"..."* 이탤릭 래핑·대사 안 마크업 금지.
//   지문 이탤릭 안 별표 중첩 금지. 장소·아이템·고유 개념은 [[명사]].
// 대상: 전수 스캔에서 걸린 2씬(rin_evidence, kael_clue_manifest)의 body 만 교체.

import mongoose from 'mongoose';

const bodies = {
  rin_evidence: [
    '*아이언가드 지하 창고. 습하고 어두운 공기. 낡은 목재 냄새와 가솔린의 잔향.*',
    '너는 체포된 밀수꾼의 넝마가 된 외투 안주머니로 손을 뻗는다. 손가락 끝에 묵직하고 서늘한 금속의 감촉이 전해진다.',
    '너의 손바닥 위에는 눈이 시릴 정도로 은백색 빛을 내뿜는 인장이 놓여 있다. 솔라리스 제국 [[사제단]]의 고위급 문장이다.',
    '아이언가드 영내의 가솔린 밀수 사건이 단순한 상인들의 범행이 아닌, 제국 사제단의 직접적인 개입이었다는 거대한 진실의 그림자가 네 눈앞에 드리운다.',
    '인장 틈에서 너는 [[작은 푸른 병]]을 발견한다. 투명한 액체 속에서 소용돌이치는 에테르 정제수의 푸른 빛이 기괴한 위압감을 준다.',
    '병의 밑면, 깨알 같은 각인 하나가 수사관의 눈에 걸린다 — "정제 책임: B. 베일". 사제단의 성흔 연구를 이끈다는, 소문으로만 떠돌던 그 이름이다.',
    '**밀수꾼** *(겁에 질린 눈으로 너를 올려다보며 떨리는 목소리로)*',
    '"수사관, 그건… 그분의 것이오. 만지면 안 됐어. 우리 모두 매장당할 거요."',
    '공포로 가득 찬 그의 외침이 축축한 지하 창고의 공기를 가르지만, 너는 혼란스러운 머릿속을 정리하며 보고할 곳을 결정해야 한다.',
  ],
  kael_clue_manifest: [
    '*매캐한 가솔린 연기와 타버린 금속의 비린내가 코끝을 찌른다. 뒤틀린 수송선 잔해 사이.*',
    '너는 뒤틀린 수송선 잔해 사이를 뒤져, 기름때로 얼룩진 [[적하 일지]] 한 권을 건져 올린다.',
    '*거칠게 넘겨진 페이지마다 가솔린 통 수량과 목적지가 빼곡히 적혀 있다.* 목적지는 모두 하나 — [[옴팔로스 정거장]], 세 달 정렬일.',
    '*일지의 마지막 장, 낯선 필체가 날카롭게 박혀 있다.*',
    '"점화기 코어 — 폐기 등급 성흔체에서 적출. 순도 충분."',
    '너는 그 문장을 *세 번* 반복해 읽는다. 머릿속이 차갑게 식으며, 눈앞의 푸른 빛이 기괴한 형상으로 일렁인다.',
    '가솔린은 단순한 연료가 아니었다. *너 같은 자들의 몸에서 자라난 결정* 이 바로 의식을 위한 점화기였다.',
    '성흔 침식은 구제할 수 없는 병이 아니었다. 그것은 정해진 때를 기다리는 잔혹한 *수확* 이었다.',
  ],
};

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'WebAdventureScene',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );
  for (const [id, body] of Object.entries(bodies)) {
    const r = await Scene.updateOne({ id }, { $set: { body } });
    console.log('format patch:', id, r.matchedCount ? 'ok' : '⚠ 씬 없음');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
