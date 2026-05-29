// bevy-rogue/assets/ → site DB 일괄 마이그레이션 스크립트
//
// 사용:
//   node scripts/migrate-from-bevy-rogue.mjs --dry-run
//   node scripts/migrate-from-bevy-rogue.mjs
//   node scripts/migrate-from-bevy-rogue.mjs --source /path/to/assets --prune
//
// 동작:
//   1. .env.local 의 MONGO_URI 로 직접 연결 (auth 우회 없음 — Mongoose 직접).
//   2. RON 파서·모델은 src/lib/ron.ts / src/models/*.tsx 를 jiti 로 동적 로드.
//      → 검증된 코드 100% 재사용 (round-trip parser).
//   3. upsert by id (기존 항목 보존 + 변경 반영). revision 백업은 site UI 의
//      import API 와 동일하게 변경되는 항목만 수행.
//   4. --dry-run 시 DB 쓰기 없이 카운트만 보고.
//   5. --prune 시 RON 에 없고 DB 에 있는 항목 삭제 (옵션, 기본 미사용).
//   6. start_loadout.ron 은 webapp 에 DB 모델이 없어 (의도된 상태) 스킵하고 안내.

import path from "node:path";
import fs from "node:fs";
import url from "node:url";

// jiti 가 webapp 직접 의존은 아니지만 pnpm 가상 저장소에 설치돼 있음 (vite 의 의존).
// 명시 경로로 불러 안정적으로 사용.
const __filename0 = url.fileURLToPath(import.meta.url);
const __dirname0 = path.dirname(__filename0);
const jitiEntry = path.resolve(
  __dirname0,
  "..",
  "node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs",
);
const { createJiti } = await import(url.pathToFileURL(jitiEntry).href);

// ── 인자 파싱 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PRUNE = args.includes("--prune");
function argValue(name, fallback) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}
const SOURCE = path.resolve(argValue("--source", "/home/seungrye/bevy-rogue/assets"));

// ── 환경: .env.local 직접 로드 (dotenv 미설치 환경 대비 수동 파싱) ──────────
const webappRoot = path.resolve(__dirname0, "..");
const envPath = path.join(webappRoot, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI 가 설정되지 않았습니다 (.env.local 확인).");
  process.exit(1);
}

// ── 동적 로드: jiti 로 src/lib/ron.ts 와 src/models/*.tsx import ─────────────
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(webappRoot, "src") },
  // models/*.tsx 가 mongoose 를 사이드 이펙트로 등록 — 캐시 사용
  cache: true,
});

const ron = await jiti.import(path.join(webappRoot, "src/lib/ron.ts"));
const mongooseMod = (await jiti.import("mongoose"));
const mongoose = mongooseMod.default ?? mongooseMod;

async function loadDefault(rel) {
  const mod = await jiti.import(path.join(webappRoot, rel));
  return mod.default ?? mod;
}

const Quest = await loadDefault("src/models/quest.tsx");
const Item = await loadDefault("src/models/item.tsx");
const Villager = await loadDefault("src/models/villager.tsx");
const Monster = await loadDefault("src/models/monster.tsx");
const StartLoadout = await loadDefault("src/models/start-loadout.tsx");
const Zone = await loadDefault("src/models/zone.tsx");
const QuestRevision = await loadDefault("src/models/quest-revision.tsx");
const ItemRevision = await loadDefault("src/models/item-revision.tsx");
const VillagerRevision = await loadDefault("src/models/villager-revision.tsx");
const MonsterRevision = await loadDefault("src/models/monster-revision.tsx");

// quest 안의 Named zone 들을 사이트 Zone 카탈로그에 자동 upsert (재마이그레이션 안전성).
const zoneExtract = await jiti.import(path.join(webappRoot, "src/lib/zone-extract.ts"));

// ── 유틸 ────────────────────────────────────────────────────────────────────
function readText(p) { return fs.readFileSync(p, "utf8"); }
function listRonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".ron")).map((f) => path.join(dir, f));
}
const log = (...a) => console.log("[migrate]", ...a);
const warn = (...a) => console.warn("[migrate:warn]", ...a);

// ── 전처리 없음 ─────────────────────────────────────────────────────────────
// 이전에는 webapp 가 모르는 필드(attack_power_min/max, tier, stationary, vendor 등)를
// 평균값으로 변환하거나 제거했지만, 이제 site 가 모든 필드를 1급으로 지원하므로
// 게임 RON 을 그대로 통과시킨다. (스키마 확장 후 재마이그레이션 시점)

// 카운터
const stats = {
  quests:       { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
  questItems:   { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
  weapons:      { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
  armors:       { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
  consumables:  { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
  accessories:  { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
  villagers:    { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
  monsters:     { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
  startLoadout: { parsed: 0, created: 0, updated: 0, unchanged: 0, skipped: 0, pruned: 0 },
};

// 변경 감지를 위한 안정 비교 (단순 JSON stringify)
function changed(existing, fields) {
  for (const k of Object.keys(fields)) {
    const a = existing[k];
    const b = fields[k];
    // Map → object 정규화
    const an = a instanceof Map ? Object.fromEntries(a) : a;
    if (JSON.stringify(an) !== JSON.stringify(b)) return true;
  }
  return false;
}

// ── 개별 카테고리 ────────────────────────────────────────────────────────────

async function migrateQuests() {
  const files = listRonFiles(path.join(SOURCE, "quests"));
  const seenIds = new Set();

  for (const file of files) {
    let def;
    try {
      def = ron.parseRon(readText(file));
    } catch (e) {
      warn(`quest 파싱 실패 ${file}: ${e.message} → skip`);
      stats.quests.skipped++;
      continue;
    }
    if (!def.id) def.id = path.basename(file, ".ron");
    stats.quests.parsed++;
    seenIds.add(def.id);

    // Named zone (SpawnGuards/PlaceTraps/SpawnMonster/InZone/spawns) 자동 등록.
    // 게임 RON 이 새 zone 을 도입했을 때 site Zone 카탈로그에 동기 누락되지 않도록.
    if (!DRY_RUN) {
      const namedZones = zoneExtract.collectNamedZones(def);
      for (const name of namedZones) {
        const existingZone = await Zone.findOne({ name }).select("_id").lean();
        if (existingZone) continue;
        try {
          await Zone.create({ name, generator: "default", description: "" });
          log(`zone auto-upsert: ${name} (from quest ${def.id})`);
        } catch { /* unique 위반 — 동시 생성 무시 */ }
      }
    }

    const fields = {
      title: def.title,
      giverNpc: def.giverNpc ?? "",
      initialPhase: def.initialPhase ?? "dormant",
      // game default_spawn_chance 미러 — RON 에 없으면 1.0
      spawnChance: def.spawnChance ?? 1.0,
      phases: def.phases ?? {},
      transitions: def.transitions ?? [],
      spawns: def.spawns ?? [],
    };

    // Mongoose 스키마 default 로 인해 existing.spawnChance 는 미저장 문서에서도
    // 1.0 으로 채워져 보인다 → "DB 에 실제로 저장됐는지" 를 .lean() 으로 별도 확인.
    const existingRaw = await Quest.findOne({ id: def.id }).lean();
    const existing = await Quest.findOne({ id: def.id });
    const spawnChanceStored = existingRaw && Object.prototype.hasOwnProperty.call(existingRaw, "spawnChance")
      ? existingRaw.spawnChance
      : undefined;
    if (existing) {
      const compareSet = {
        title: existing.title,
        giverNpc: existing.giverNpc,
        initialPhase: existing.initialPhase,
        // 비교 시에는 lean() 로 본 "실제 저장 값" 을 사용해 미저장 문서를 update 로 유도.
        spawnChance: spawnChanceStored,
        phases: existing.phases,
        transitions: existing.transitions,
        spawns: existing.spawns,
      };
      if (!changed(compareSet, fields)) {
        stats.quests.unchanged++;
        continue;
      }
      if (DRY_RUN) { stats.quests.updated++; continue; }
      // revision 백업
      await QuestRevision.create({
        questId: existing._id,
        version: existing.version,
        quest: {
          id: existing.id,
          title: existing.title,
          giverNpc: existing.giverNpc,
          initialPhase: existing.initialPhase,
          spawnChance: existing.spawnChance ?? 1.0,
          phases: Object.fromEntries(existing.phases ?? new Map()),
          transitions: existing.transitions,
          spawns: existing.spawns,
        },
      });
      existing.title = fields.title;
      existing.giverNpc = fields.giverNpc;
      existing.initialPhase = fields.initialPhase;
      existing.spawnChance = fields.spawnChance;
      existing.phases = new Map(Object.entries(fields.phases));
      existing.transitions = fields.transitions;
      existing.spawns = fields.spawns;
      existing.version = (existing.version ?? 1) + 1;
      await existing.save();
      stats.quests.updated++;
    } else {
      if (DRY_RUN) { stats.quests.created++; continue; }
      await Quest.create({
        id: def.id,
        title: fields.title,
        giverNpc: fields.giverNpc,
        initialPhase: fields.initialPhase,
        spawnChance: fields.spawnChance,
        phases: fields.phases,
        transitions: fields.transitions,
        spawns: fields.spawns,
        version: 1,
      });
      stats.quests.created++;
    }
  }

  if (PRUNE && !DRY_RUN) {
    const all = await Quest.find({}, { id: 1 }).lean();
    for (const doc of all) {
      if (!seenIds.has(doc.id)) {
        await Quest.deleteOne({ _id: doc._id });
        stats.quests.pruned++;
      }
    }
  }
}

// items: kind 별로 한 파일씩 처리 — 공통 헬퍼
async function migrateItemFile(file, kind, parser, statKey, preprocess) {
  if (!fs.existsSync(file)) {
    warn(`${kind} 파일 없음: ${file}`);
    return new Set();
  }
  let defs;
  try {
    const src = preprocess ? preprocess(readText(file)) : readText(file);
    defs = parser(src);
  } catch (e) {
    warn(`${kind} 파싱 실패 ${file}: ${e.message} → 전체 skip`);
    return new Set();
  }
  const seenIds = new Set();

  for (const def of defs) {
    stats[statKey].parsed++;
    seenIds.add(def.id);

    const fields = {
      kind: def.kind,
      displayName: def.displayName,
      glyphAscii: def.glyphAscii,
      glyphUnicode: def.glyphUnicode,
      glyphGameIcon: def.glyphGameIcon,
      pickupMessage: def.pickupMessage,
    };
    if (def.kind === "quest")           fields.imagePath = def.imagePath;
    else if (def.kind === "weapon") {
      fields.attackPower = def.attackPower;
      if (def.attackPowerMin !== undefined) fields.attackPowerMin = def.attackPowerMin;
      if (def.attackPowerMax !== undefined) fields.attackPowerMax = def.attackPowerMax;
      if (def.tier !== undefined) fields.tier = def.tier;
      fields.element = def.element ?? null;
    }
    else if (def.kind === "armor") {
      fields.defenseBonus = def.defenseBonus;
      if (def.defenseBonusMin !== undefined) fields.defenseBonusMin = def.defenseBonusMin;
      if (def.defenseBonusMax !== undefined) fields.defenseBonusMax = def.defenseBonusMax;
      if (def.tier !== undefined) fields.tier = def.tier;
    }
    else if (def.kind === "consumable") fields.effect = def.effect;
    else if (def.kind === "accessory")  fields.desc = def.desc;

    const existing = await Item.findOne({ id: def.id });
    if (existing) {
      if (existing.kind !== def.kind) {
        warn(`id 충돌: '${def.id}' 가 이미 다른 kind('${existing.kind}') 로 존재 → skip`);
        stats[statKey].skipped++;
        continue;
      }
      const compareSet = {
        kind: existing.kind,
        displayName: existing.displayName,
        glyphAscii: existing.glyphAscii,
        glyphUnicode: existing.glyphUnicode,
        glyphGameIcon: existing.glyphGameIcon,
        pickupMessage: existing.pickupMessage,
      };
      if (def.kind === "quest")           compareSet.imagePath = existing.imagePath;
      else if (def.kind === "weapon") {
        compareSet.attackPower = existing.attackPower;
        if (existing.attackPowerMin !== undefined) compareSet.attackPowerMin = existing.attackPowerMin;
        if (existing.attackPowerMax !== undefined) compareSet.attackPowerMax = existing.attackPowerMax;
        if (existing.tier !== undefined) compareSet.tier = existing.tier;
        compareSet.element = existing.element ?? null;
      }
      else if (def.kind === "armor") {
        compareSet.defenseBonus = existing.defenseBonus;
        if (existing.defenseBonusMin !== undefined) compareSet.defenseBonusMin = existing.defenseBonusMin;
        if (existing.defenseBonusMax !== undefined) compareSet.defenseBonusMax = existing.defenseBonusMax;
        if (existing.tier !== undefined) compareSet.tier = existing.tier;
      }
      else if (def.kind === "consumable") compareSet.effect = existing.effect;
      else if (def.kind === "accessory")  compareSet.desc = existing.desc;

      if (!changed(compareSet, fields)) {
        stats[statKey].unchanged++;
        continue;
      }
      if (DRY_RUN) { stats[statKey].updated++; continue; }
      // revision 백업
      const snap = { id: existing.id, ...compareSet };
      await ItemRevision.create({
        itemId: existing._id,
        version: existing.version,
        item: snap,
      });
      Object.assign(existing, fields);
      existing.version = (existing.version ?? 1) + 1;
      await existing.save();
      stats[statKey].updated++;
    } else {
      if (DRY_RUN) { stats[statKey].created++; continue; }
      await Item.create({ id: def.id, ...fields, version: 1 });
      stats[statKey].created++;
    }
  }

  return seenIds;
}

async function migrateItems() {
  const itemsDir = path.join(SOURCE, "items");
  const allSeen = new Set();

  for (const id of await migrateItemFile(
    path.join(itemsDir, "quest_items.ron"), "quest", ron.parseQuestItemsRon, "questItems")) allSeen.add(id);
  for (const id of await migrateItemFile(
    path.join(itemsDir, "weapons.ron"), "weapon", ron.parseWeaponsRon, "weapons")) allSeen.add(id);
  for (const id of await migrateItemFile(
    path.join(itemsDir, "armors.ron"), "armor", ron.parseArmorsRon, "armors")) allSeen.add(id);
  for (const id of await migrateItemFile(
    path.join(itemsDir, "consumables.ron"), "consumable", ron.parseConsumablesRon, "consumables")) allSeen.add(id);
  for (const id of await migrateItemFile(
    path.join(itemsDir, "accessories.ron"), "accessory", ron.parseAccessoriesRon, "accessories")) allSeen.add(id);

  if (PRUNE && !DRY_RUN) {
    const all = await Item.find({}, { id: 1, kind: 1 }).lean();
    for (const doc of all) {
      if (!allSeen.has(doc.id)) {
        await Item.deleteOne({ _id: doc._id });
        const key = doc.kind === "quest" ? "questItems"
                  : doc.kind === "weapon" ? "weapons"
                  : doc.kind === "armor" ? "armors"
                  : doc.kind === "accessory" ? "accessories"
                  : "consumables";
        stats[key].pruned++;
      }
    }
  }
}

async function migrateVillagers() {
  const file = path.join(SOURCE, "villagers/villagers.ron");
  if (!fs.existsSync(file)) { warn(`villagers 파일 없음: ${file}`); return; }
  let defs;
  try {
    defs = ron.parseVillagersRon(readText(file));
  } catch (e) {
    warn(`villagers 파싱 실패: ${e.message}`); return;
  }
  const seenIds = new Set();

  for (const v of defs) {
    if (!v.id || !v.id.trim()) {
      warn(`villager id 누락: ${v.name || "(이름 없음)"} → skip`);
      stats.villagers.skipped++;
      continue;
    }
    stats.villagers.parsed++;
    seenIds.add(v.id);

    const fields = {
      name: v.name,
      color: v.color,
      dialogs: v.dialogs ?? [],
      speed: v.speed ?? 1.0,
      stationary: !!v.stationary,
      vendor: !!v.vendor,
    };
    const existing = await Villager.findOne({ id: v.id });
    if (existing) {
      const compareSet = {
        name: existing.name,
        color: existing.color,
        dialogs: existing.dialogs,
        speed: existing.speed,
        stationary: !!existing.stationary,
        vendor: !!existing.vendor,
      };
      if (!changed(compareSet, fields)) { stats.villagers.unchanged++; continue; }
      if (DRY_RUN) { stats.villagers.updated++; continue; }
      await VillagerRevision.create({
        villagerId: existing._id,
        version: existing.version,
        villager: { id: existing.id, ...compareSet },
      });
      Object.assign(existing, fields);
      existing.version = (existing.version ?? 1) + 1;
      await existing.save();
      stats.villagers.updated++;
    } else {
      if (DRY_RUN) { stats.villagers.created++; continue; }
      await Villager.create({ id: v.id, ...fields });
      stats.villagers.created++;
    }
  }

  if (PRUNE && !DRY_RUN) {
    const all = await Villager.find({}, { id: 1 }).lean();
    for (const doc of all) {
      if (!seenIds.has(doc.id)) {
        await Villager.deleteOne({ _id: doc._id });
        stats.villagers.pruned++;
      }
    }
  }
}

async function migrateMonsters() {
  const file = path.join(SOURCE, "monsters/monsters.ron");
  if (!fs.existsSync(file)) { warn(`monsters 파일 없음: ${file}`); return; }
  let defs;
  try {
    defs = ron.parseMonstersRon(readText(file));
  } catch (e) {
    warn(`monsters 파싱 실패: ${e.message}`); return;
  }
  const seenIds = new Set();

  for (const m of defs) {
    if (!m.id || !m.id.trim()) {
      warn(`monster id 누락: ${m.displayName || "(이름 없음)"} → skip`);
      stats.monsters.skipped++;
      continue;
    }
    stats.monsters.parsed++;
    seenIds.add(m.id);

    const fields = {
      displayName: m.displayName,
      glyph: m.glyph,
      color: m.color,
      hp: m.hp,
      attack: m.attack,
      defense: m.defense,
      visionRadius: m.visionRadius,
      speed: m.speed,
      element: m.element ?? null,
      spawnWeight: m.spawnWeight,
      zones: m.zones ?? [],
      spawnCondition: m.spawnCondition ?? null,
      questOnly: !!m.questOnly,
    };

    const existing = await Monster.findOne({ id: m.id });
    if (existing) {
      const compareSet = {
        displayName: existing.displayName,
        glyph: existing.glyph,
        color: existing.color,
        hp: existing.hp,
        attack: existing.attack,
        defense: existing.defense,
        visionRadius: existing.visionRadius,
        speed: existing.speed,
        element: existing.element ?? null,
        spawnWeight: existing.spawnWeight,
        zones: existing.zones,
        spawnCondition: existing.spawnCondition ?? null,
        questOnly: !!existing.questOnly,
      };
      if (!changed(compareSet, fields)) { stats.monsters.unchanged++; continue; }
      if (DRY_RUN) { stats.monsters.updated++; continue; }
      await MonsterRevision.create({
        monsterId: existing._id,
        version: existing.version,
        monster: { id: existing.id, ...compareSet },
      });
      Object.assign(existing, fields);
      existing.version = (existing.version ?? 1) + 1;
      await existing.save();
      stats.monsters.updated++;
    } else {
      if (DRY_RUN) { stats.monsters.created++; continue; }
      await Monster.create({ id: m.id, ...fields });
      stats.monsters.created++;
    }
  }

  if (PRUNE && !DRY_RUN) {
    const all = await Monster.find({}, { id: 1 }).lean();
    for (const doc of all) {
      if (!seenIds.has(doc.id)) {
        await Monster.deleteOne({ _id: doc._id });
        stats.monsters.pruned++;
      }
    }
  }
}

async function migrateStartLoadout() {
  const file = path.join(SOURCE, "items/start_loadout.ron");
  if (!fs.existsSync(file)) {
    warn(`start_loadout 파일 없음: ${file}`);
    return;
  }
  let def;
  try {
    def = ron.parseStartLoadoutDef(readText(file));
  } catch (e) {
    warn(`start_loadout 파싱 실패: ${e.message}`);
    stats.startLoadout.skipped++;
    return;
  }
  stats.startLoadout.parsed++;

  const fields = {
    gold: def.gold ?? 0,
    weapon: def.weapon ?? null,
    armor: def.armor ?? null,
    items: def.items ?? [],
    consumables: (def.consumables ?? []).map((c) => ({ id: c.id, count: c.count })),
  };

  // 단일 doc(_id="default"). lean 비교로 mongoose Document 메타 노이즈 회피.
  const existing = await StartLoadout.findById("default").lean();
  if (existing) {
    const compareSet = {
      gold: existing.gold,
      weapon: existing.weapon ?? null,
      armor: existing.armor ?? null,
      items: existing.items ?? [],
      consumables: (existing.consumables ?? []).map((c) => ({ id: c.id, count: c.count })),
    };
    if (!changed(compareSet, fields)) {
      stats.startLoadout.unchanged++;
      return;
    }
    if (DRY_RUN) { stats.startLoadout.updated++; return; }
    const doc = await StartLoadout.findById("default");
    doc.gold = fields.gold;
    doc.weapon = fields.weapon;
    doc.armor = fields.armor;
    doc.items = fields.items;
    doc.consumables = fields.consumables;
    doc.version = (doc.version ?? 1) + 1;
    await doc.save();
    stats.startLoadout.updated++;
  } else {
    if (DRY_RUN) { stats.startLoadout.created++; return; }
    await StartLoadout.create({ _id: "default", ...fields, version: 1 });
    stats.startLoadout.created++;
  }
}

// ── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  log(`source = ${SOURCE}`);
  log(`mode   = ${DRY_RUN ? "DRY RUN (DB 쓰기 없음)" : "APPLY (DB 쓰기)"}${PRUNE ? " + PRUNE" : ""}`);

  await mongoose.connect(process.env.MONGO_URI);
  log("MongoDB 연결됨");

  try {
    log("→ quests 마이그레이션 시작");
    await migrateQuests();
    log(`  quests: parsed=${stats.quests.parsed} created=${stats.quests.created} updated=${stats.quests.updated} unchanged=${stats.quests.unchanged} skipped=${stats.quests.skipped} pruned=${stats.quests.pruned}`);

    log("→ items 마이그레이션 시작");
    await migrateItems();
    for (const k of ["questItems", "weapons", "armors", "consumables", "accessories"]) {
      const s = stats[k];
      log(`  items.${k}: parsed=${s.parsed} created=${s.created} updated=${s.updated} unchanged=${s.unchanged} skipped=${s.skipped} pruned=${s.pruned}`);
    }

    log("→ villagers 마이그레이션 시작");
    await migrateVillagers();
    log(`  villagers: parsed=${stats.villagers.parsed} created=${stats.villagers.created} updated=${stats.villagers.updated} unchanged=${stats.villagers.unchanged} skipped=${stats.villagers.skipped} pruned=${stats.villagers.pruned}`);

    log("→ monsters 마이그레이션 시작");
    await migrateMonsters();
    log(`  monsters: parsed=${stats.monsters.parsed} created=${stats.monsters.created} updated=${stats.monsters.updated} unchanged=${stats.monsters.unchanged} skipped=${stats.monsters.skipped} pruned=${stats.monsters.pruned}`);

    log("→ start_loadout 마이그레이션 시작");
    await migrateStartLoadout();
    log(`  startLoadout: parsed=${stats.startLoadout.parsed} created=${stats.startLoadout.created} updated=${stats.startLoadout.updated} unchanged=${stats.startLoadout.unchanged} skipped=${stats.startLoadout.skipped}`);

    // 요약
    console.log("\n[migrate] === 요약 ===");
    for (const [k, s] of Object.entries(stats)) {
      console.log(`  ${k.padEnd(12)} parsed=${s.parsed}  created=${s.created}  updated=${s.updated}  unchanged=${s.unchanged}  skipped=${s.skipped}  pruned=${s.pruned}`);
    }
  } finally {
    await mongoose.disconnect();
    log("MongoDB 연결 해제");
  }
}

main().catch((e) => {
  console.error("[migrate] 치명적 오류:", e);
  process.exit(1);
});
