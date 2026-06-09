#!/usr/bin/env node
// scripts/seed-351-callback-partial.mjs — #351 핀포인트 시나리오 확장.
//
// 두 가지 TRPG적 깊이 추가 (사용자 승인, 2026-06-10):
//
//   1) 장기 콜백 — 호프만 생존 추적.
//      rin 이 상관 호프만을 [언변] 으로 설득해 *살려보낸* 경우
//      (rin_underground_talk), 그 빚이 광산 길목에서 추적자로 돌아온다.
//      → flag hoffmann_spared 설정 + rin_underground 에 conditional 콜백 분기
//      + 신규 씬 omphalos_hoffmann_return.
//      "내 과거 선택이 세계에 흔적을 남긴다" 체감.
//
//   2) 부분 성공 — 정찰병 희생.
//      강철 갈래(station_path_steel)에 derail/hijack 외 *세 번째 길*:
//      정찰병이 수동 분리 레버에 목숨을 걸어 의식 차량 *절반만* 떼어낸다.
//      추락은 *늦춰지나 멈추진 않는다* (mixed success). 그의 희생이
//      약화된 의식을 멈출 harmony 의 문을 연다.
//      → station_path_steel 의 back_to_station 을 sacrifice 로 교체 (3 분기 유지)
//      + 신규 씬 climax_partial_decouple.
//
// 모두 idempotent (findOneAndUpdate $set / upsert). illustration 보호 가드.
// content-lint(structure/reachability) 통과 전제로 설계:
//   - rin_underground 2 분기, station_path_steel 3 분기, 신규 2 씬 각 2 분기 (≤3).
//   - 신규 씬 모두 도달 가능 + exit 존재 (dead-end 없음).

import mongoose from 'mongoose';

const PLACEHOLDER = '/web-adventure/scenes/placeholder-square.svg';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    'S',
    new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }),
  );

  // illustration 보호 upsert 헬퍼.
  async function upsertScene(doc) {
    const cur = await Scene.findOne({ id: doc.id }).lean();
    const next = { ...doc };
    if (cur?.illustration && !cur.illustration.includes('placeholder')) {
      next.illustration = cur.illustration; // painter 실 URL 보존.
    }
    await Scene.findOneAndUpdate({ id: doc.id }, next, { upsert: true, new: true });
    console.log('upsert:', doc.id);
  }

  // ── 콜백 1: rin_underground_talk 에 hoffmann_spared flag ──────────────
  {
    const s = await Scene.findOne({ id: 'rin_underground_talk' }).lean();
    if (s) {
      const onEnter = { ...(s.onEnter ?? {}) };
      onEnter.setFlags = { ...(onEnter.setFlags ?? {}), hoffmann_spared: true };
      await Scene.findOneAndUpdate(
        { id: 'rin_underground_talk' },
        { $set: { onEnter } },
      );
      console.log('updated: rin_underground_talk — setFlags.hoffmann_spared');
    } else {
      console.warn('skip: rin_underground_talk 없음');
    }
  }

  // ── 콜백 2: rin_underground 에 conditional 콜백 분기 ───────────────────
  // 기존 choices(1: to_omphalos) 에 hidden conditional 추가 → 2 분기.
  {
    const s = await Scene.findOne({ id: 'rin_underground' }).lean();
    if (s) {
      const choices = [...(s.choices ?? [])];
      const exists = choices.some((c) => c.id === 'hoffmann_shadow');
      if (!exists) {
        // 콜백 분기를 *맨 앞* 에 — flag 보유 시 먼저 눈에 띄도록.
        choices.unshift({
          kind: 'conditional',
          id: 'hoffmann_shadow',
          label:
            '[빚] 골목 끝에 익숙한 그림자 — *호프만*. 그가 너를 살려보낸 빚을 받으러 왔다.',
          condition: { kind: 'flag', key: 'hoffmann_spared' },
          to: 'omphalos_hoffmann_return',
          hidden: true,
        });
        await Scene.findOneAndUpdate(
          { id: 'rin_underground' },
          { $set: { choices } },
        );
        console.log('updated: rin_underground — hoffmann_shadow conditional 추가');
      } else {
        console.log('skip: rin_underground — hoffmann_shadow 이미 존재');
      }
    } else {
      console.warn('skip: rin_underground 없음');
    }
  }

  // ── 콜백 3: 신규 씬 omphalos_hoffmann_return ─────────────────────────
  await upsertScene({
    id: 'omphalos_hoffmann_return',
    illustration: PLACEHOLDER,
    title: 'Scene 04b — 빚을 받으러 온 자',
    body: [
      '광산 지대의 마지막 길목. *호프만* 이 너의 앞을 막아선다. 본부에서 너를 *살려보낸* 그 손에 — 이번엔 사제단의 *위임장* 이 들려 있다.',
      '"린, 내가 너를 보낸 건 자비가 아니었어. *빚* 이었지. 사제단은 너를 산 채로 원한다. 나는 — 그 값을 받아야 해."',
      '그의 눈빛엔 여전히 너를 처음 가르치던 날의 잔영이 있다. 그러나 그 손은 흔들리지 않는다.',
    ],
    choices: [
      {
        kind: 'probability',
        id: 'talk_again',
        label: '[언변] 그를 한 번 더 — 마지막으로 돌려세운다.',
        stat: 'cha',
        difficulty: 14,
        onSuccess: 'omphalos_outskirts',
        onFailure: 'omphalos_caught_at_gate',
        stigmaDeltaOnFailure: 3,
      },
      {
        kind: 'plain',
        id: 'cut_the_debt',
        label:
          '[빚을 끊는다] 등을 돌리고 옴팔로스로 — 그의 목소리를 *뒤에 남긴* 채 달린다.',
        to: 'omphalos_outskirts',
        stigmaDelta: 3,
      },
    ],
    onEnter: { stigmaDelta: 2 },
  });

  // ── 부분성공 1: station_path_steel 재구성 (back → sacrifice) ──────────
  {
    const s = await Scene.findOne({ id: 'station_path_steel' }).lean();
    if (s) {
      const choices = (s.choices ?? []).filter(
        (c) => c.id !== 'back_to_station' && c.id !== 'sacrifice_scout',
      );
      choices.push({
        kind: 'plain',
        id: 'sacrifice_scout',
        label:
          '[희생] 정찰병에게 신호 — 둘이서 화차를 *수동으로* 분리한다. 누군가는 레버를 잡아야 한다.',
        to: 'climax_partial_decouple',
        stigmaDelta: 1,
      });
      await Scene.findOneAndUpdate(
        { id: 'station_path_steel' },
        { $set: { choices } },
      );
      console.log(
        'updated: station_path_steel — back_to_station → sacrifice_scout',
      );
    } else {
      console.warn('skip: station_path_steel 없음');
    }
  }

  // ── 부분성공 2: 신규 씬 climax_partial_decouple ───────────────────────
  await upsertScene({
    id: 'climax_partial_decouple',
    illustration: PLACEHOLDER,
    title: 'Scene 07a-iii — 절반의 분리',
    body: [
      '정찰병이 화차 사이의 *수동 분리 레버* 에 매달린다. 강철 연결부가 비명을 지르며 벌어진다 — 의식 차량의 *절반* 이 선로 밖으로 미끄러진다.',
      '그러나 마지막 핀이 그의 외투를 문다. 너가 손을 뻗는 순간, 그는 *고개를 젓는다*. "신호를 줘서 고마웠어." 화차가 그를 데리고 어둠으로 떨어진다.',
      '에테르 코어의 푸른 빛이 — 꺼지지 않는다. 다만 *옅어졌다*. 세계의 추락은 *늦춰졌다*. 멈추진 않았다. 절반의 의식은 아직 살아 있다.',
    ],
    choices: [
      {
        kind: 'plain',
        id: 'chase_weakened',
        label:
          '[약화된 의식] 절반의 힘이라면 — *멈출 수 있다*. 그의 희생을 헛되이 하지 않는다.',
        to: 'climax_harmony_path',
        stigmaDelta: 1,
      },
      {
        kind: 'plain',
        id: 'withdraw_partial',
        label:
          '여기까지다. *절반을 구했으니* — 더는 잃지 않기 위해 물러선다.',
        to: 'climax_fall_path',
        stigmaDelta: 2,
      },
    ],
    onEnter: {
      setFlags: { ritual_weakened: true, scout_sacrificed: true },
      hpDelta: -4,
      stigmaDelta: 3,
    },
  });

  await mongoose.disconnect();
  console.log('\n✓ seed-351-callback-partial 완료');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
