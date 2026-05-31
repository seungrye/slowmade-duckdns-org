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
  [0xE908, 0xF0C8], // ankh
  [0xE909, 0xF0D4], // anvil
  [0xE917, 0xF17B], // battle-axe (axe)
  [0xE91C, 0xF240], // broken-axe (battered-axe)
  [0xE929, 0xF21C], // box-trap (bear-trap)
  [0xE935, 0xF544], // energy-shield (bolt-shield)
  [0xE93A, 0xF1F3], // book-cover (book)
  [0xE940, 0xF213], // bowie-knife
  [0xE946, 0xF23C], // broadsword
  [0xE948, 0xF72F], // heart-minus (broken-heart)
  [0xE95D, 0xF30B], // castle (castle-emblem)
  [0xE976, 0xF3EC], // cracked-shield
  [0xE978, 0xF402], // crossbow
  [0xE97F, 0xF415], // crown
  [0xE983, 0xF421], // crystal-cluster
  [0xE992, 0xF47C], // diamond-trophy (diamond)
  [0xE9A2, 0xF4CE], // dragon-head (dragon)
  [0xE9AD, 0xF50F], // easter-egg (egg)
  [0xE9B5, 0xF573], // eyeball
  [0xE9B6, 0xF57E], // fairy-wand
  [0xE9BA, 0xF2B9], // caravel (fast-ship)
  [0xE9C6, 0xF5E4], // fizzing-flask
  [0xE9E0, 0xF687], // gem-pendant (gem)
  [0xE9E2, 0xF697], // glass-heart
  [0xE9EE, 0xF6F7], // hammer-drop (hammer)
  [0xEA16, 0xF820], // key
  [0xEA1C, 0xF84A], // lantern-flame
  [0xEA2F, 0xF899], // lightning-saber (lightning-sword)
  [0xEA65, 0xFAB9], // plain-dagger
  [0xEA72, 0xFAFD], // potion-ball (potion)
  [0xEA87, 0xFBB8], // round-shield
  [0xEA8F, 0xFC12], // scroll-unfurled
  [0xEA96, 0xFC57], // shield
  [0xEAA1, 0xFC9B], // skull-crossed-bones (skull)
  [0xEAAC, 0xFE74], // thrust-bend (spear-head)
  [0xEAD1, 0xFEA0], // torch
  [0xEAD4, 0xFECB], // trefoil-lily
  [0xEAE7, 0xFFD5], // wolf-head

  // Unicode emoji/symbol → game-icons
  [0x1F4DC, 0xFC12], // 📜 scroll-unfurled
  [0x1F50E, 0xF8F2], // 🔎 magnifying-glass
  [0x1F526, 0xF5F7], // 🔦 flashlight
  [0x2020,  0xF400], // † cross-mark
  [0x2295,  0xFE29], // ⊕ target-arrows
  [0x2318,  0xF440], // ⌘ cycle
  [0x2393,  0xF753], // ⎓ hexagonal-nut
  [0x25B2,  0xFED1], // ▲ triangle-target
  [0x25B6,  0xFAC9], // ▶ play-button
  [0x25B8,  0xF0FE], // ▸ arrowhead
  [0x25C6,  0xF43B], // ◆ cut-diamond
  [0x25C9,  0xF25F], // ◉ bullseye
  [0x25CE,  0xF0E3], // ◎ archery-target
  [0x25D4,  0xF6F1], // ◔ half-tornado
  [0x2600,  0xFDD9], // ☀ sun
  [0x2605,  0xFD7A], // ★ star-formation
  [0x2620,  0xFC9B], // ☠ skull-crossed-bones
  [0x2638,  0xF3B1], // ☸ compass
  [0x2640,  0xF5A2], // ♀ female
  [0x2641,  0xF509], // ♁ earth-asia-oceania
  [0x265A,  0xF347], // ♚ chess-king
  [0x2665,  0xF738], // ♥ hearts
  [0x2692,  0xF6F9], // ⚒ hammer-sickle
  [0x2694,  0xF40C], // ⚔ crossed-swords
  [0x2697,  0xFBB6], // ⚗ round-bottom-flask
  [0x2698,  0xF2FF], // ⚘ carnivorous-plant
  [0x269C,  0xF602], // ⚜ fleur-de-lys
  [0x26D3,  0xF323], // ⛓ chained-heart
  [0x2702,  0xFC06], // ✂ scissors
  [0x2709,  0xF54D], // ✉ envelope
  [0x270E,  0xFB38], // ✎ quill-ink
  [0x271D,  0xF400], // ✝ cross-mark
  [0x2720,  0xF771], // ✠ holy-symbol
  [0x2742,  0xFCFF], // spark-plug
  [0x2746,  0xFCD8], // ❄ snowflake-2
  [0x2767,  0xFAC0], // ❧ plant-roots
  [0x2B22,  0xF753], // ⬢ hexagonal-nut
]);

const DEFAULT_GAME_ICON = 0xF753; // hexagonal-nut — 매핑 누락 시 시각적 placeholder

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
      } else if (cp >= 0xF000 && cp <= 0x0005) {
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
