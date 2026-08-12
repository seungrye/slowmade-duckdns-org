#!/usr/bin/env bash
# 고전 게임 코너(#109)의 자산을 배포 호스트에 내려받는다.
#
#   bash scripts/games/fetch-emulatorjs.sh            # 없는 것만 받는다(멱등)
#   bash scripts/games/fetch-emulatorjs.sh --force    # 다시 받는다
#
# 받는 것:
#   1. EmulatorJS 본체  → webapp/public/games/retro/data/
#   2. 기종별 코어 5종  → .../data/cores/            (기종당 ~1MB)
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

CDN="${EMULATORJS_CDN:-https://cdn.emulatorjs.org/stable/data}"
# src/lib/retro/platforms.ts 의 core 값과 같아야 한다. 기종을 늘리면 여기도 함께 늘릴 것.
CORES=(fceumm snes9x gambatte mgba genesis_plus_gx)

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

# ── 2. 코어 ─────────────────────────────────────────────────────────────────
log "코어 ${#CORES[@]} 종"
for core in "${CORES[@]}"; do
    if fetch "$CDN/cores/$core-wasm.data" "$CORES_DIR/$core-wasm.data"; then
        printf '  %-18s %s\n' "$core" "$(du -h "$CORES_DIR/$core-wasm.data" | cut -f1)"
    fi
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

# ── 마무리 ───────────────────────────────────────────────────────────────────
echo
log "완료 — 롬 ${rom_ok} 개 받음$([[ $rom_fail -gt 0 ]] && echo ", ${rom_fail} 개 실패(그 항목은 목록에서 빠집니다)")"
log "  data   $(du -sh "$DATA_DIR"   2>/dev/null | cut -f1)"
log "  roms   $(du -sh "$ROMS_DIR"   2>/dev/null | cut -f1)"
log "  covers $(du -sh "$COVERS_DIR" 2>/dev/null | cut -f1)"
log "  합계   $(du -sh "$RETRO_DIR"  2>/dev/null | cut -f1)"
