#!/usr/bin/env node
// scripts/seed-353-kael-deduction.mjs — #353 kael 추리 시퀀스 "잔해 속의 진실".
//
// kael Act1 의 추락(kael_falling) 직후, 옴팔로스 합류 전에 *kael 전용* 추리
// 미니 시퀀스를 삽입. 성흔(ability)은 주인공과 독립이라 ability 조건으로
// kael 전용성을 못 걸지만, kael 만 거치는 Act1 구간이라 전용성 자동 보장.
//
// 구조 (허브-스포크 + 누적 카운터):
//   kael_falling / kael_falling_aftermath → kael_wreckage_hub
//     ├ 조사: kael_clue_bodies   (단서+1, 침식+2, saw_bodies)
//     ├ 조사: kael_clue_manifest (단서+1, 침식+2, saw_manifest)
//     └ 떠난다 → kael_truth_gate
//                  ├ (kael_clue ≥ 2) → kael_truth_revealed → knowsAscensionPlot
//                  └ (부족)          → omphalos_outskirts
//   진실/일반 모두 omphalos_outskirts 합류.
//
// 핵심 트레이드오프: 단서마다 침식 +2 (kael 시작 80 → 84+, 임계 80 진입).
//   "진실을 알수록 몸이 굳는다" — 시한부 테마 + 추리 결합.
// 보상(절제): knowsAscensionPlot 선취 → station_knowledge_branch 의 harmony
//   분기 해금(엔딩 직접 부여 아님).
//
// 엔진 도구 첫 사용: incrementCounters(누적) + condition minFlag(임계).
// 멱등: upsert + $set. illustration 보호 가드.

import mongoose from 'mongoose';

const PH = '/web-adventure/scenes/placeholder-square.svg';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'S',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );

  async function upsertScene(doc) {
    const cur = await Scene.findOne({ id: doc.id }).lean();
    const next = { ...doc };
    if (cur?.illustration && !cur.illustration.includes('placeholder')) {
      next.illustration = cur.illustration;
    }
    await Scene.findOneAndUpdate({ id: doc.id }, next, { upsert: true, new: true });
    console.log('upsert:', doc.id);
  }

  // ── 신규 1: 허브 ────────────────────────────────────────────────────
  await upsertScene({
    id: 'kael_wreckage_hub',
    illustration: PH,
    title: 'Scene 04b — 폐기물 잔해장',
    body: [
      '추락이 멈춘 곳은 *옴팔로스 외곽의 폐기물 처리장*. 사제단 수송선이 *쓸모를 다한 것들* 을 버리는 곳이다. 녹슨 컨테이너와 *부서진 보관함* 들이 안개 속에 늘어서 있다.',
      '너는 이곳을 안다. *너 같은 것들* 이 오는 곳이라는 걸. 푸른 결정 가루가 바닥에 *눈처럼* 깔려 있다.',
      '외곽의 첨탑이 멀지 않다. 그러나 — 발이 *떨어지지 않는다*. 이 잔해 속에 *네가 모르는 무언가* 가 있다.',
    ],
    choices: [
      {
        kind: 'conditional',
        id: 'inspect_bodies',
        label: '조사 — 부서진 보관함의 *식별 명판들*.',
        condition: { kind: 'flag', key: 'saw_bodies', expect: false },
        to: 'kael_clue_bodies',
        hidden: true,
      },
      {
        kind: 'conditional',
        id: 'inspect_manifest',
        label: '조사 — 사제단 수송선의 *적하 일지*.',
        condition: { kind: 'flag', key: 'saw_manifest', expect: false },
        to: 'kael_clue_manifest',
        hidden: true,
      },
      {
        kind: 'plain',
        id: 'leave_wreckage',
        label: '더는 보지 않는다 — 외곽으로 향한다.',
        to: 'kael_truth_gate',
      },
    ],
  });

  // ── 신규 2: 단서 A — 명판들 ─────────────────────────────────────────
  await upsertScene({
    id: 'kael_clue_bodies',
    illustration: PH,
    title: 'Scene 04b-i — 명판들',
    body: [
      '보관함을 열자 *식별 명판* 들이 쏟아진다. 번호와 날짜, 그리고 *성흔 등급*. 모두 너처럼 — *마법 과다로 시한부 판정* 을 받은 자들.',
      '가장 위의 명판에 *너의 번호 다음 숫자* 가 적혀 있다. 너는 *유일한 폐기물이 아니었다*. 사제단은 *너 같은 자들* 을 *수십 명* 씩 버려왔다.',
      "그러나 이상하다 — 명판의 *사인란* 에 적힌 건 '석화 사망' 이 아니라 *'코어 적출 — 회수 완료'*. 손목의 결정이 *차갑게 욱신거린다*.",
    ],
    choices: [
      {
        kind: 'plain',
        id: 'back_from_bodies',
        label: '잔해 더미로 — *다른 것* 을 더 본다.',
        to: 'kael_wreckage_hub',
      },
    ],
    onEnter: {
      setFlags: { saw_bodies: true },
      incrementCounters: ['kael_clue'],
      stigmaDelta: 2,
    },
  });

  // ── 신규 3: 단서 B — 적하 일지 ──────────────────────────────────────
  await upsertScene({
    id: 'kael_clue_manifest',
    illustration: PH,
    title: 'Scene 04b-ii — 적하 일지',
    body: [
      "수송선 잔해에서 *적하 일지* 한 권을 건진다. 페이지마다 *가솔린 통 수량* 과 *목적지* — 모두 '*옴팔로스 정거장, 세 달 정렬일*'.",
      '마지막 장에 다른 필체. "*점화기 코어 — 폐기 등급 성흔체에서 적출. 순도 충분.*" 너는 그 문장을 *세 번* 읽는다.',
      '가솔린이 *연료* 가 아니었다. *너 같은 자들의 결정* 이 — 의식의 *점화기* 였다. 침식은 병이 아니라 *수확* 이었다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'back_from_manifest',
        label: '잔해 더미로 — *나머지* 를 본다.',
        to: 'kael_wreckage_hub',
      },
    ],
    onEnter: {
      setFlags: { saw_manifest: true },
      incrementCounters: ['kael_clue'],
      stigmaDelta: 2,
    },
  });

  // ── 신규 4: 출구 판정 게이트 ────────────────────────────────────────
  await upsertScene({
    id: 'kael_truth_gate',
    illustration: PH,
    title: 'Scene 04c — 떠나기 전',
    body: [
      '안개가 짙어진다. 외곽의 불빛이 잔해 너머에서 너를 부른다. 손목의 결정이 *전보다 무겁다* — 너무 많이 보았다.',
      '발을 떼기 전, 너는 *지금까지 본 것* 을 머릿속에서 맞춰본다. 조각이 충분한가, 아니면 *아직 빈 곳* 이 있는가.',
      '진실은 — *알면 돌이킬 수 없다*. 그러나 모르면 *호구처럼 끌려갈 뿐*.',
    ],
    choices: [
      {
        kind: 'conditional',
        id: 'piece_it_together',
        label: '[진실] 흩어진 조각이 — *하나의 그림* 이 된다.',
        condition: { kind: 'minFlag', key: 'kael_clue', min: 2 },
        to: 'kael_truth_revealed',
        hidden: true,
      },
      {
        kind: 'plain',
        id: 'leave_uncertain',
        label: '아직 모르겠다 — 외곽으로.',
        to: 'omphalos_outskirts',
      },
    ],
  });

  // ── 신규 5: 진실 ────────────────────────────────────────────────────
  await upsertScene({
    id: 'kael_truth_revealed',
    illustration: PH,
    title: 'Scene 04d — 하나의 그림',
    body: [
      '명판과 일지가 *하나로 겹친다*. 사제단은 *시한부 성흔체* 를 양산하고, 침식이 무르익으면 *결정 코어를 적출* 해 — 가솔린 통에 담는다.',
      '세 달이 겹치는 새벽, 그 코어들이 *옴팔로스 정거장에서 점화* — 부유도시의 마력을 *한 번에 빨아들여* 사제단의 *신계 승천* 을 연다. 도시들은 *동력을 잃고 떨어진다*.',
      '너는 *폐기물* 이 아니었다. *연료* 였다. 그리고 이제 — *그 사실을 아는 연료* 다. 손목의 결정이 *너의 분노에 맞춰* 빛난다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'to_outskirts_knowing',
        label: '외곽으로 — *이번엔 내가 안다*.',
        to: 'omphalos_outskirts',
      },
    ],
    onEnter: {
      setFlags: { knowsAscensionPlot: true },
      stigmaDelta: 1,
    },
  });

  // ── 수정: kael_falling → 허브로 우회 ────────────────────────────────
  {
    const s = await Scene.findOne({ id: 'kael_falling' }).lean();
    if (s) {
      const choices = (s.choices ?? []).map((c) => {
        if (c.id === 'rise_to_ground' && c.onSuccess === 'omphalos_outskirts') {
          return { ...c, onSuccess: 'kael_wreckage_hub' };
        }
        if (c.id === 'lunar_navigation' && c.to === 'omphalos_outskirts') {
          return { ...c, to: 'kael_wreckage_hub' };
        }
        return c;
      });
      await Scene.findOneAndUpdate({ id: 'kael_falling' }, { $set: { choices } });
      console.log('updated: kael_falling → kael_wreckage_hub');
    }
  }

  // ── 수정: kael_falling_aftermath → 허브로 우회 ──────────────────────
  {
    const s = await Scene.findOne({ id: 'kael_falling_aftermath' }).lean();
    if (s) {
      const choices = (s.choices ?? []).map((c) =>
        c.id === 'crawl_to_outskirts' && c.to === 'omphalos_outskirts'
          ? { ...c, to: 'kael_wreckage_hub' }
          : c,
      );
      await Scene.findOneAndUpdate(
        { id: 'kael_falling_aftermath' },
        { $set: { choices } },
      );
      console.log('updated: kael_falling_aftermath → kael_wreckage_hub');
    }
  }

  await mongoose.disconnect();
  console.log('\n✓ seed-353-kael-deduction 완료');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
