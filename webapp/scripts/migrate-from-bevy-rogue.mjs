// The bulk migration script from bevy-rogue/assets/ into the site DB
//
// Usage:
//   node scripts/migrate-from-bevy-rogue.mjs --dry-run
//   node scripts/migrate-from-bevy-rogue.mjs
//   node scripts/migrate-from-bevy-rogue.mjs --source /path/to/assets --prune
//
// How it works:
//   1. connects directly with .env.local's MONGO_URI (no auth bypass - Mongoose directly).
//   2. the RON parser and the models are loaded dynamically from src/lib/ron.ts and src/models/*.tsx through jiti.
//      -> 100% reuse of verified code (a round-trip parser).
//   3. upsert by id (existing entries preserved, changes applied). A revision backup is taken only for changed
//      entries, as in the site UI's import API.
//   4. --dry-run reports the counts without writing to the DB.
//   5. --prune deletes entries in the DB but absent from the RON (optional, off by default).
//   6. start_loadout.ron has no DB model in webapp (deliberately), so it is skipped with a notice.

import path from "node:path";
import fs from "node:fs";
import url from "node:url";

// jiti is not a direct webapp dependency but is installed in the pnpm virtual store (vite depends on it).
// It is loaded by an explicit path for reliability.
const __filename0 = url.fileURLToPath(import.meta.url);
const __dirname0 = path.dirname(__filename0);
const jitiEntry = path.resolve(
  __dirname0,
  "..",
  "node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs",
);
const { createJiti } = await import(url.pathToFileURL(jitiEntry).href);

// -- parsing the arguments ---------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PRUNE = args.includes("--prune");
function argValue(name, fallback) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}
const SOURCE = path.resolve(argValue("--source", "/home/seungrye/bevy-rogue/assets"));

// -- the environment: .env.local loaded directly (parsed by hand, for machines without dotenv) --
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

// -- dynamic loading: src/lib/ron.ts and src/models/*.tsx imported through jiti --
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(webappRoot, "src") },
  // models/*.tsx registers mongoose as a side effect - the cache is used
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

// The Named zones inside a quest are upserted into the site's Zone catalogue automatically (so re-migration is safe).
const zoneExtract = await jiti.import(path.join(webappRoot, "src/lib/zone-extract.ts"));

// -- utilities --------------------------------------------------------------
function readText(p) { return fs.readFileSync(p, "utf8"); }
function listRonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".ron")).map((f) => path.join(dir, f));
}
const log = (...a) => console.log("[migrate]", ...a);
const warn = (...a) => console.warn("[migrate:warn]", ...a);

// -- no preprocessing -------------------------------------------------------
// Fields webapp did not know (attack_power_min/max, tier, stationary, vendor and so on) used to be
// averaged or dropped, but the site now supports every field as a first-class citizen, so
// the game's RON passes through as it is. (At the point of re-migrating after the schema was extended.)

// the counters
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

// A stable comparison for detecting changes (a plain JSON stringify)
function changed(existing, fields) {
  for (const k of Object.keys(fields)) {
    const a = existing[k];
    const b = fields[k];
    // Map -> object normalisation
    const an = a instanceof Map ? Object.fromEntries(a) : a;
    if (JSON.stringify(an) !== JSON.stringify(b)) return true;
  }
  return false;
}

// -- the individual categories ----------------------------------------------

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

    // Named zones (SpawnGuards/PlaceTraps/SpawnMonster/InZone/spawns) are registered automatically.
    // So a new zone introduced by the game's RON is never missing from the site's Zone catalogue.
    // The generator comes from the same quest's OpenPortal mapping (falling back to "bsp").
    // An existing zone whose generator === "default" (an older version's placeholder) is corrected.
    if (!DRY_RUN) {
      const portalRefs = zoneExtract.collectFromQuest(def); // [{zone, generator}]
      const portalGen = new Map();
      for (const p of portalRefs) {
        if (!portalGen.has(p.zone) && p.generator) portalGen.set(p.zone, p.generator);
      }
      const namedZones = zoneExtract.collectNamedZones(def);
      for (const name of namedZones) {
        const generator = portalGen.get(name) ?? "bsp";
        const existingZone = await Zone.findOne({ name }).select("_id generator").lean();
        if (existingZone) {
          if (existingZone.generator === "default" && generator !== "default") {
            await Zone.updateOne({ _id: existingZone._id }, { $set: { generator } });
            log(`zone generator 정정: ${name} (default → ${generator})`);
          }
          continue;
        }
        try {
          await Zone.create({ name, generator, description: "" });
          log(`zone auto-upsert: ${name} → ${generator} (from quest ${def.id})`);
        } catch { /* unique 위반 — 동시 생성 무시 */ }
      }
    }

    const fields = {
      title: def.title,
      giverNpc: def.giverNpc ?? "",
      initialPhase: def.initialPhase ?? "dormant",
      // Mirroring the game's default_spawn_chance - 1.0 when the RON has none
      spawnChance: def.spawnChance ?? 1.0,
      phases: def.phases ?? {},
      transitions: def.transitions ?? [],
      spawns: def.spawns ?? [],
    };

    // The Mongoose schema default makes existing.spawnChance appear as 1.0 even on a document that never
    // stored it -> whether it is *actually stored in the DB* is checked separately with .lean().
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
        // The comparison uses the "actually stored value" seen through lean(), so an unstored document goes through update.
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
      // the revision backup
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

// items: one file per kind - the shared helper
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
    else if (def.kind === "accessory") {
      fields.desc = def.desc;
      if (def.effects !== undefined) fields.effects = def.effects;
    }

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
      else if (def.kind === "accessory") {
        compareSet.desc = existing.desc;
        if (existing.effects !== undefined) compareSet.effects = existing.effects;
      }

      if (!changed(compareSet, fields)) {
        stats[statKey].unchanged++;
        continue;
      }
      if (DRY_RUN) { stats[statKey].updated++; continue; }
      // the revision backup
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

    // homeZone - when the RON side's home_zone is missing, ron.ts's parseVillagerDef never sets that key,
    // so v.homeZone === undefined. As with the game's #[serde(default)], it is corrected to
    // Town and stored in a consistent shape (a mirror).
    const homeZone = v.homeZone ?? { type: "Town" };
    const fields = {
      name: v.name,
      color: v.color,
      dialogs: v.dialogs ?? [],
      speed: v.speed ?? 1.0,
      stationary: !!v.stationary,
      vendor: !!v.vendor,
      homeZone,
    };
    const existing = await Villager.findOne({ id: v.id });
    if (existing) {
      // existing.homeZone holds a Mongoose Document, so it is normalised to a plain object.
      // The new schema: only { type: "Town" } | { type: "Named", id: "..." } is valid.
      const existingHomeZone = existing.homeZone
        ? { type: existing.homeZone.type, id: existing.homeZone.id }
        : { type: "Town" };
      // Cleaned so undefined fields are excluded from the comparison
      if (existingHomeZone.id === undefined) delete existingHomeZone.id;
      const compareSet = {
        name: existing.name,
        color: existing.color,
        dialogs: existing.dialogs,
        speed: existing.speed,
        stationary: !!existing.stationary,
        vendor: !!existing.vendor,
        homeZone: existingHomeZone,
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

  // A single doc (_id="default"). A lean comparison avoids the mongoose Document's metadata noise.
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

// -- main -------------------------------------------------------------------

// Following the game code's ZoneId simplification, the standard Named zones are registered automatically
// when the catalogue lacks them. The same generator as the game's static `ZoneId::algorithm()` table.
async function seedDefaultZones() {
  const defaults = [
    { name: "forest",           generator: "forest",       description: "숲 — 마을과 던전 사이 (게임 표준 Named zone)" },
    { name: "dungeon_1",        generator: "bsp",          description: "던전 1층 (게임 표준 Named zone)" },
    { name: "dungeon_2",        generator: "bsp",          description: "던전 2층 (게임 표준 Named zone)" },
    { name: "mountain_village", generator: "grid_village", description: "산속 마을 — 사냥꾼/광부/전사 (퀘스트 보상 portal 로 해금)" },
    { name: "seaside_harbor",   generator: "walled_town",  description: "항구 마을 — 탐험가/마법사/보물사냥꾼 (퀘스트 보상 portal 로 해금)" },
  ];
  let created = 0;
  let unchanged = 0;
  for (const def of defaults) {
    const existing = await Zone.findOne({ name: def.name }).select("_id").lean();
    if (existing) { unchanged++; continue; }
    if (DRY_RUN) { created++; continue; }
    try {
      await Zone.create(def);
      log(`zone seed: ${def.name} → ${def.generator}`);
      created++;
    } catch { /* unique 위반 — 동시 생성 무시 */ }
  }
  log(`  zones seed: created=${created} unchanged=${unchanged}`);
}

async function main() {
  log(`source = ${SOURCE}`);
  log(`mode   = ${DRY_RUN ? "DRY RUN (DB 쓰기 없음)" : "APPLY (DB 쓰기)"}${PRUNE ? " + PRUNE" : ""}`);

  await mongoose.connect(process.env.MONGO_URI);
  log("MongoDB 연결됨");

  try {
    log("→ 기본 Named zones 자동 등록");
    await seedDefaultZones();

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

    // the summary
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
