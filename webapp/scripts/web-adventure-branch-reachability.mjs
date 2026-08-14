#!/usr/bin/env node
// scripts/web-adventure-branch-reachability.mjs — #286 모든 conditional 분기 도달성.
//
// 분기마다 *어느 주인공 / 어떤 사전 경로* 로 도달·통과 가능한지 매트릭스 출력.
//
// 도달성 = (1) 그 choice 가 있는 씬에 BFS 도달 + (2) 조건 (flag / minStat) 충족 가능.

import mongoose from 'mongoose';

const PROTAGONISTS = {
  kael:   { startScene: 'kael_infirmary', baseStats: { str: 5, dex: 6, int: 7, cha: 4, con: 4, wis: 5 } },
  rin:    { startScene: 'rin_harbor',     baseStats: { str: 4, dex: 6, int: 7, cha: 6, con: 5, wis: 6 } },
  solwen: { startScene: 'solwen_grove',   baseStats: { str: 6, dex: 7, int: 5, cha: 5, con: 5, wis: 7 } },
};

// 회차 부메랑 — 어떤 ending 이전 회차에 도달해야 world flag 가 set 되나
const WORLD_FLAG_SOURCES = {
  'world.solaris_strong':  'ascension',
  'world.revolution_won':  'revolution',
  'world.harmony_kept':    'harmony',
  'world.world_fell':      'fall',
  'world.last_one_fell':   'petrification',
  'world.sylvan_awoke':    'sylvan_bond',
};

function collectTargets(scene) {
  const t = [];
  for (const c of scene.choices ?? []) {
    if (c.to) t.push(c.to);
    if (c.onSuccess) t.push(c.onSuccess);
    if (c.onFailure) t.push(c.onFailure);
  }
  return t;
}

function bfsScenes(registry, roots) {
  const visited = new Set();
  const q = [...roots];
  while (q.length) {
    const id = q.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const s = registry[id];
    if (!s) continue;
    for (const t of collectTargets(s)) if (!visited.has(t)) q.push(t);
  }
  return visited;
}

/**
 * 이 flag 를 세우는 곳을 모두 찾는다.
 *
 * 씬 `onEnter` 만 보면 안 된다 — **선택지에도 setFlags 가 있고**(#89 선택의 흔적) 엔진이
 * 실제로 적용한다(engine/reducer 의 applyChoiceFlags). 처음엔 onEnter 만 봐서, 멀쩡히
 * 도달 가능한 분기 3 개를 "도달 불가" 로 신고했다. 이야기를 지키라고 만든 검사가 늑대를
 * 외치면 아무도 믿지 않게 된다.
 */
function flagSetters(registry, flag) {
  const result = [];
  for (const [id, s] of Object.entries(registry)) {
    if (s.onEnter?.setFlags?.[flag] === true) {
      result.push(`scene:${id} onEnter`);
    }
    for (const c of s.choices ?? []) {
      if (c.setFlags?.[flag] === true) {
        result.push(`choice:${id}/${c.id ?? '?'}`);
      }
    }
  }
  return result;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  const all = await Scene.find({}).lean();
  const registry = Object.fromEntries(all.map((s) => [s.id, s]));

  const startScenes = Object.values(PROTAGONISTS).map((p) => p.startScene);
  const allReachable = bfsScenes(registry, startScenes);

  // 모든 conditional choice 수집
  const branches = [];
  for (const s of all) {
    for (const c of s.choices ?? []) {
      if (c.kind === 'conditional') {
        branches.push({
          sceneId: s.id,
          choiceId: c.id,
          hidden: c.hidden === true,
          condition: c.condition,
          to: c.to,
        });
      }
    }
  }

  console.log(`=== 전체 ${branches.length} conditional 분기 도달성 ===\n`);

  let issues = 0;
  for (const b of branches) {
    const sceneReached = allReachable.has(b.sceneId);
    const lines = [
      `${b.sceneId}/${b.choiceId} → ${b.to}`,
      `  hidden:        ${b.hidden}`,
      `  씬 도달:        ${sceneReached ? '✓' : '✗'}`,
    ];
    if (!sceneReached) issues++;

    if (b.condition.kind === 'flag') {
      const key = b.condition.key;
      if (key.startsWith('world.')) {
        const sourceEnding = WORLD_FLAG_SOURCES[key];
        lines.push(`  조건 flag:      ${key} (회차 부메랑)`);
        lines.push(`  set 출처:       이전 회차의 ${sourceEnding} ending 도달`);
        lines.push(`  통과 가능:      모든 주인공 (이전 회차 ${sourceEnding} 도달 시)`);
      } else {
        const setters = flagSetters(registry, key);
        lines.push(`  조건 flag:      ${key}`);
        lines.push(`  set 출처:       ${setters.length === 0 ? '✗ 없음!' : setters.join(', ')}`);
        if (setters.length === 0) {
          issues++;
          lines.push('  ⚠️ 도달 불가 — flag 가 어디에서도 set 안 됨');
        }
      }
    } else if (b.condition.kind === 'minStat') {
      const passing = Object.entries(PROTAGONISTS)
        .filter(([, p]) => (p.baseStats[b.condition.stat] ?? 0) >= b.condition.min)
        .map(([n]) => n);
      lines.push(`  조건 stat:      ${b.condition.stat} ≥ ${b.condition.min}`);
      lines.push(`  통과 주인공:    ${passing.length === 0 ? '✗ 없음!' : passing.join(', ')}`);
      if (passing.length === 0) issues++;
    }
    console.log(lines.join('\n'));
    console.log();
  }

  console.log(`=== 요약: ${branches.length} 분기 중 ${issues} 도달 불가 ===`);
  await mongoose.disconnect();
  process.exit(issues === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
