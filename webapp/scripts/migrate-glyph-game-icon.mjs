// items 컬렉션의 glyphGameIcon 값을 game-icons.net codepoint 로 변환하고
// glyphUnicode 필드를 영구 제거한다. RPG-Awesome PUA (U+E900~U+EAEE) 와
// 기타 Unicode emoji/symbol 을 의미 매핑으로 game-icons.net Supplementary PUA
// (U+FF000~U+100005) 로 대체한다.
//
// 사용:
//   node scripts/migrate-glyph-game-icon.mjs --dry-run
//   node scripts/migrate-glyph-game-icon.mjs
//
// 동작:
//   1. .env.local 의 MONGO_URI 로 mongoose 직접 연결.
//   2. items 컬렉션 전체 순회.
//   3. glyphGameIcon 의 첫 codepoint 가 매핑표에 있으면 새 codepoint 의 단일 문자로 교체.
//      ASCII (0x00~0x7F) 는 그대로 둔다.
//      매핑표에 없는 PUA 는 디폴트 (hexagonal-nut U+FF753) 로 폴백 + warn.
//   4. glyphUnicode 필드는 $unset 으로 영구 제거.
//   5. revisionn 백업 없음 — 일회성 마이그레이션이고, 이후엔 정규 UI 가 revision 관리.

import path from "node:path";
import fs from "node:fs";
import url from "node:url";

const __filename0 = url.fileURLToPath(import.meta.url);
const __dirname0 = path.dirname(__filename0);

// 의미 매핑 — 게임 RON 마이그레이션에 사용한 표와 동일.
// 키: 옛 codepoint (RPG-Awesome PUA 또는 Unicode emoji/symbol)
// 값: game-icons.net codepoint (Supplementary PUA)
const GLYPH_MAPPING = new Map([
  // RPG-Awesome PUA → game-icons
  [0xE908, 0xFF0C8], // ankh
  [0xE909, 0xFF0D4], // anvil
  [0xE917, 0xFF17B], // battle-axe (axe)
  [0xE91C, 0xFF240], // broken-axe (battered-axe)
  [0xE929, 0xFF21C], // box-trap (bear-trap)
  [0xE935, 0xFF544], // energy-shield (bolt-shield)
  [0xE93A, 0xFF1F3], // book-cover (book)
  [0xE940, 0xFF213], // bowie-knife
  [0xE946, 0xFF23C], // broadsword
  [0xE948, 0xFF72F], // heart-minus (broken-heart)
  [0xE95D, 0xFF30B], // castle (castle-emblem)
  [0xE976, 0xFF3EC], // cracked-shield
  [0xE978, 0xFF402], // crossbow
  [0xE97F, 0xFF415], // crown
  [0xE983, 0xFF421], // crystal-cluster
  [0xE992, 0xFF47C], // diamond-trophy (diamond)
  [0xE9A2, 0xFF4CE], // dragon-head (dragon)
  [0xE9AD, 0xFF50F], // easter-egg (egg)
  [0xE9B5, 0xFF573], // eyeball
  [0xE9B6, 0xFF57E], // fairy-wand
  [0xE9BA, 0xFF2B9], // caravel (fast-ship)
  [0xE9C6, 0xFF5E4], // fizzing-flask
  [0xE9E0, 0xFF687], // gem-pendant (gem)
  [0xE9E2, 0xFF697], // glass-heart
  [0xE9EE, 0xFF6F7], // hammer-drop (hammer)
  [0xEA16, 0xFF820], // key
  [0xEA1C, 0xFF84A], // lantern-flame
  [0xEA2F, 0xFF899], // lightning-saber (lightning-sword)
  [0xEA65, 0xFFAB9], // plain-dagger
  [0xEA72, 0xFFAFD], // potion-ball (potion)
  [0xEA87, 0xFFBB8], // round-shield
  [0xEA8F, 0xFFC12], // scroll-unfurled
  [0xEA96, 0xFFC57], // shield
  [0xEAA1, 0xFFC9B], // skull-crossed-bones (skull)
  [0xEAAC, 0xFFE74], // thrust-bend (spear-head)
  [0xEAD1, 0xFFEA0], // torch
  [0xEAD4, 0xFFECB], // trefoil-lily
  [0xEAE7, 0xFFFD5], // wolf-head

  // Unicode emoji/symbol → game-icons
  [0x1F4DC, 0xFFC12], // 📜 scroll-unfurled
  [0x1F50E, 0xFF8F2], // 🔎 magnifying-glass
  [0x1F526, 0xFF5F7], // 🔦 flashlight
  [0x2020,  0xFF400], // † cross-mark
  [0x2295,  0xFFE29], // ⊕ target-arrows
  [0x2318,  0xFF440], // ⌘ cycle
  [0x2393,  0xFF753], // ⎓ hexagonal-nut
  [0x25B2,  0xFFED1], // ▲ triangle-target
  [0x25B6,  0xFFAC9], // ▶ play-button
  [0x25B8,  0xFF0FE], // ▸ arrowhead
  [0x25C6,  0xFF43B], // ◆ cut-diamond
  [0x25C9,  0xFF25F], // ◉ bullseye
  [0x25CE,  0xFF0E3], // ◎ archery-target
  [0x25D4,  0xFF6F1], // ◔ half-tornado
  [0x2600,  0xFFDD9], // ☀ sun
  [0x2605,  0xFFD7A], // ★ star-formation
  [0x2620,  0xFFC9B], // ☠ skull-crossed-bones
  [0x2638,  0xFF3B1], // ☸ compass
  [0x2640,  0xFF5A2], // ♀ female
  [0x2641,  0xFF509], // ♁ earth-asia-oceania
  [0x265A,  0xFF347], // ♚ chess-king
  [0x2665,  0xFF738], // ♥ hearts
  [0x2692,  0xFF6F9], // ⚒ hammer-sickle
  [0x2694,  0xFF40C], // ⚔ crossed-swords
  [0x2697,  0xFFBB6], // ⚗ round-bottom-flask
  [0x2698,  0xFF2FF], // ⚘ carnivorous-plant
  [0x269C,  0xFF602], // ⚜ fleur-de-lys
  [0x26D3,  0xFF323], // ⛓ chained-heart
  [0x2702,  0xFFC06], // ✂ scissors
  [0x2709,  0xFF54D], // ✉ envelope
  [0x270E,  0xFFB38], // ✎ quill-ink
  [0x271D,  0xFF400], // ✝ cross-mark
  [0x2720,  0xFF771], // ✠ holy-symbol
  [0x2742,  0xFFCFF], // spark-plug
  [0x2746,  0xFFCD8], // ❄ snowflake-2
  [0x2767,  0xFFAC0], // ❧ plant-roots
  [0x2B22,  0xFF753], // ⬢ hexagonal-nut
]);

const DEFAULT_GAME_ICON = 0xFF753; // hexagonal-nut — 매핑 누락 시 시각적 placeholder

// .env.local 의 MONGO_URI 추출 (mongoose 직접 연결)
function loadMongoUri() {
  const envPath = path.resolve(__dirname0, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local 없음: ${envPath}`);
  }
  const text = fs.readFileSync(envPath, "utf8");
  const m = text.match(/^MONGO_URI=(.+)$/m);
  if (!m) throw new Error(".env.local 에 MONGO_URI 없음");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");

  const mongoose = (await import("mongoose")).default;
  const uri = loadMongoUri();
  console.log(`[migrate-glyph] mongoose 연결: ${uri.replace(/:[^:@]*@/, ":****@")}`);
  await mongoose.connect(uri);
  const items = mongoose.connection.collection("items");

  const all = await items.find({}).toArray();
  console.log(`[migrate-glyph] 총 ${all.length} item`);

  let migrated = 0;
  let warnings = 0;
  let skipped = 0;
  for (const doc of all) {
    const ops = {};

    // glyphUnicode 제거 (있을 때만)
    if (doc.glyphUnicode !== undefined) {
      ops.$unset = { glyphUnicode: "" };
    }

    // glyphGameIcon 변환
    const cur = doc.glyphGameIcon;
    if (typeof cur === "string" && cur.length > 0) {
      const cp = cur.codePointAt(0);
      if (cp <= 0x7F) {
        // ASCII — 그대로 둔다
      } else if (cp >= 0xFF000 && cp <= 0x100005) {
        // 이미 game-icons PUA 범위 — 그대로
      } else if (GLYPH_MAPPING.has(cp)) {
        const newCp = GLYPH_MAPPING.get(cp);
        ops.$set = { ...(ops.$set || {}), glyphGameIcon: String.fromCodePoint(newCp) };
      } else {
        console.warn(`[migrate-glyph] WARN ${doc.id}: codepoint U+${cp.toString(16).toUpperCase()} 매핑 없음 → 디폴트(hexagonal-nut) 적용`);
        warnings++;
        ops.$set = { ...(ops.$set || {}), glyphGameIcon: String.fromCodePoint(DEFAULT_GAME_ICON) };
      }
    } else {
      // 빈 값 → 디폴트
      ops.$set = { ...(ops.$set || {}), glyphGameIcon: String.fromCodePoint(DEFAULT_GAME_ICON) };
    }

    if (Object.keys(ops).length === 0) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[dry-run] ${doc.id}: ${JSON.stringify(ops)}`);
    } else {
      await items.updateOne({ _id: doc._id }, ops);
    }
    migrated++;
  }

  console.log(`[migrate-glyph] 완료. 마이그레이션 ${migrated}, 스킵 ${skipped}, 경고 ${warnings} (dryRun=${dryRun})`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("[migrate-glyph] 실패:", e);
  process.exit(1);
});
