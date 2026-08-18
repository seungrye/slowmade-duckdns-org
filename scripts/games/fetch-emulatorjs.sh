#!/usr/bin/env bash
# 고전 게임 코너(#109)의 자산을 배포 호스트에 내려받는다.
#
#   bash scripts/games/fetch-emulatorjs.sh            # 없는 것만 받는다(멱등)
#   bash scripts/games/fetch-emulatorjs.sh --force    # 다시 받는다
#
# 받는 것:
#   1. EmulatorJS 본체  → webapp/public/games/retro/data/
#   2. 기종별 코어 3종  → .../data/cores/            (snes9x·mgba ~1MB, fbneo ~8MB)
#   3. 홈브류 롬·커버   → .../roms/, .../covers/
#
# 왜 저장소에 안 넣나: 에뮬레이터 릴리스 전체가 압축 289MB 다. 필요한 것만 골라 받으면 수십 MB 로
# 끝난다. `webapp/public/games/bevy-rogue/` 도 같은 이유로 gitignore + 배포 시 확인 구조다.
#
# 왜 릴리스 7z 가 아니라 CDN 인가: 릴리스 자산은 .7z 인데 이 호스트에 7z 가 없다(sudo 없이
# 못 깐다). EmulatorJS 가 공식 CDN 에 같은 내용을 zip 과 개별 파일로 올려 두므로 그쪽에서
# 받아 **우리 서버에 복사해 둔다** — 실행 시점에는 CDN 을 전혀 타지 않는다(자체 호스팅).

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RETRO_DIR="$REPO_DIR/webapp/public/games/retro"
DATA_DIR="$RETRO_DIR/data"
CORES_DIR="$DATA_DIR/cores"
ROMS_DIR="$RETRO_DIR/roms"
COVERS_DIR="$RETRO_DIR/covers"
MANIFEST="$REPO_DIR/webapp/src/lib/retro/builtin-games.json"

# **nightly 를 쓴다** (#186). netplay 는 stable 릴리스(v4.2.3)에 없다 — 거기서는
# `EJS_DEBUG_XX && EJS_EXPERIMENTAL_NETPLAY` 로 잠겨 있고 WebRTC 자체가 빠져 있다.
# nightly 번들에는 `RTCPeerConnection`·`EJS_netplayICEServers` 가 있고 잠금이 풀려 있다.
#
# 되돌리려면 stable 로 다시 받으면 된다(자산은 gitignore 대상이라 흔적이 남지 않는다):
#   EMULATORJS_CDN=https://cdn.emulatorjs.org/stable/data bash scripts/games/fetch-emulatorjs.sh --force
CDN="${EMULATORJS_CDN:-https://cdn.emulatorjs.org/nightly/data}"
# src/lib/retro/platforms.ts 의 core 값과 같아야 한다. 기종을 늘리면 여기도 함께 늘릴 것.
CORES=(snes9x mgba fbneo)

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

log()  { printf '\033[1;34m[retro]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[retro]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[retro]\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl  >/dev/null || die "curl 이 필요합니다."
command -v unzip >/dev/null || die "unzip 이 필요합니다."
command -v node  >/dev/null || die "node 가 필요합니다(매니페스트를 읽습니다)."
[[ -f "$MANIFEST" ]] || die "매니페스트가 없습니다: $MANIFEST"

# 파일 하나 받기. 이미 있고 --force 가 아니면 건너뛴다(멱등).
# 실패해도 죽지 않는다 — 롬 하나가 사라져도 나머지는 받아야 하고, 없는 항목은 화면에서 빠진다.
fetch() {
    local url="$1" dest="$2"
    if [[ -s "$dest" && $FORCE -eq 0 ]]; then
        return 0
    fi
    mkdir -p "$(dirname "$dest")"
    if curl -fsSL --retry 2 --max-time 180 -o "$dest.part" "$url"; then
        mv "$dest.part" "$dest"
        return 0
    fi
    rm -f "$dest.part"
    warn "받지 못함: $url"
    return 1
}

# ── 1. EmulatorJS 본체 ───────────────────────────────────────────────────────
log "EmulatorJS 본체 (${CDN})"
mkdir -p "$DATA_DIR"

if [[ ! -s "$DATA_DIR/emulator.min.js" || $FORCE -eq 1 ]]; then
    tmp_zip="$(mktemp -t emulatorjs-XXXXXX.zip)"
    trap 'rm -f "$tmp_zip"' EXIT
    curl -fsSL --retry 2 --max-time 300 -o "$tmp_zip" "$CDN/emulator.min.zip" \
        || die "emulator.min.zip 을 받지 못했습니다. CDN 주소를 확인하세요: $CDN"
    unzip -qo "$tmp_zip" -d "$DATA_DIR"
    rm -f "$tmp_zip"
    trap - EXIT
    log "  emulator.min.zip 풀었음"
else
    log "  이미 있음 (다시 받으려면 --force)"
fi

# loader.js 는 zip 밖에 따로 있다 — player.html 이 이 파일을 부른다.
fetch "$CDN/loader.js"    "$DATA_DIR/loader.js"    || die "loader.js 를 받지 못했습니다."
fetch "$CDN/version.json" "$DATA_DIR/version.json" || true

# 압축 해제 모듈 — **zip 에 안 들어 있다.**
# 코어 .data 파일은 7z 아카이브(매직 37 7A BC AF)라 브라우저가 실행 전에 풀어야 하는데,
# 그 일을 이 파일들이 한다. 없으면 코어가 통째로 안 뜬다 — zip 만 풀고 끝내면 조용히 망가진다.
for f in compression/extract7z.js compression/extractzip.js compression/libunrar.js compression/libunrar.wasm; do
    fetch "$CDN/$f" "$DATA_DIR/$f" || die "$f 를 받지 못했습니다(코어 압축 해제에 반드시 필요)."
done

# 언어 파일 — 없으면 실행마다 "Missing language en-US" 404 가 뜬다(치명적이진 않지만 시끄럽다).
fetch "$CDN/localization/en-US.json" "$DATA_DIR/localization/en-US.json" || true

# ── 2. 코어 ─────────────────────────────────────────────────────────────────
# **변종 둘을 다 받는다.** EmulatorJS 는 WebGL2 를 쓸 수 있으면 `<core>-wasm.data`,
# 아니면 `<core>-legacy-wasm.data` 를 찾는다. 어느 쪽이 될지는 브라우저와 아래 리포트 JSON 이
# 정한다 — 하나만 받아 두면 반대쪽 브라우저에서 "Error downloading core" 로 죽는다.
# (-thread- 변종은 받지 않는다. 스레드를 켜지 않으므로 절대 요청되지 않는다.)
#
# 리포트 JSON 이 **필수다.** 이게 없으면 EmulatorJS 가 `defaultWebGL2` 를 못 읽어
# webgl2Enabled 를 false 로 떨어뜨리고, 그러면 WebGL2 되는 브라우저까지 legacy 코어를 찾는다.
# 실제로 이것 때문에 전 기종이 실행되지 않았다.
log "코어 ${#CORES[@]} 종 (변종 2 + 리포트)"
for core in "${CORES[@]}"; do
    got=""
    for variant in "$core-wasm.data" "$core-legacy-wasm.data"; do
        fetch "$CDN/cores/$variant" "$CORES_DIR/$variant" \
            && got="$got $(du -h "$CORES_DIR/$variant" | cut -f1)"
    done
    fetch "$CDN/cores/reports/$core.json" "$CORES_DIR/reports/$core.json" \
        || warn "  $core 리포트 없음 — legacy 코어로만 돌게 됩니다."
    printf '  %-18s%s\n' "$core" "$got"
done

# ── 3. 홈브류 롬·커버 ────────────────────────────────────────────────────────
# 매니페스트의 source(= retrobrews 저장소 주소)에서 raw 주소를 만든다.
log "홈브류 롬·커버"
mkdir -p "$ROMS_DIR" "$COVERS_DIR"

rom_ok=0 rom_fail=0
while IFS=$'\t' read -r file cover raw_base; do
    [[ -z "$file" ]] && continue
    if fetch "$raw_base/$file" "$ROMS_DIR/$file"; then
        rom_ok=$((rom_ok + 1))
    else
        rom_fail=$((rom_fail + 1))
    fi
    [[ -n "$cover" ]] && fetch "$raw_base/$cover" "$COVERS_DIR/$cover" || true
done < <(node -e '
    const games = require(process.argv[1]);
    for (const g of games) {
        // https://github.com/retrobrews/nes-games → https://raw.githubusercontent.com/retrobrews/nes-games/master
        const raw = g.source.replace("https://github.com/", "https://raw.githubusercontent.com/") + "/master";
        process.stdout.write([g.file, g.cover || "", raw].join("\t") + "\n");
    }
' "$MANIFEST")

# ── 정리: 매니페스트·코어 목록에 없는 파일 치우기 ────────────────────────────
# 기종을 줄였을 때 옛 롬·코어가 남아 용량만 먹는 걸 막는다.
log "목록에 없는 파일 정리"
node -e '
  const fs = require("fs"), path = require("path");
  const [manifest, romsDir, coversDir, coresDir, coreList] = process.argv.slice(1);
  const games = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const keepRoms = new Set(games.map((g) => g.file));
  const keepCovers = new Set(games.map((g) => g.cover).filter(Boolean));
  const keepCores = new Set();
  for (const c of coreList.split(" ").filter(Boolean)) {
    keepCores.add(c + "-wasm.data");
    keepCores.add(c + "-legacy-wasm.data");
  }
  let n = 0;
  const prune = (dir, keep) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (fs.statSync(path.join(dir, f)).isDirectory()) continue;
      if (!keep.has(f)) { fs.unlinkSync(path.join(dir, f)); n++; }
    }
  };
  prune(romsDir, keepRoms);
  prune(coversDir, keepCovers);
  prune(coresDir, keepCores);
  console.log("  치운 파일: " + n + " 개");
' "$MANIFEST" "$ROMS_DIR" "$COVERS_DIR" "$CORES_DIR" "${CORES[*]}"

# ── 마무리 ───────────────────────────────────────────────────────────────────
echo
log "완료 — 롬 ${rom_ok} 개 받음$([[ $rom_fail -gt 0 ]] && echo ", ${rom_fail} 개 실패(그 항목은 목록에서 빠집니다)")"
log "  CDN    $CDN"
log "  버전   $(grep -ohoE 'version=\"[0-9.]+\"' "$DATA_DIR/emulator.min.js" 2>/dev/null | head -1 || echo '(불명)')  netplay(WebRTC) $(grep -c RTCPeerConnection "$DATA_DIR/emulator.min.js" 2>/dev/null || echo 0)건"
log "  data   $(du -sh "$DATA_DIR"   2>/dev/null | cut -f1)"
log "  roms   $(du -sh "$ROMS_DIR"   2>/dev/null | cut -f1)"
log "  covers $(du -sh "$COVERS_DIR" 2>/dev/null | cut -f1)"
log "  합계   $(du -sh "$RETRO_DIR"  2>/dev/null | cut -f1)"
