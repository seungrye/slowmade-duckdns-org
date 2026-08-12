// 롬 패치 적용 — IPS / BPS / UPS (#112).
//
// **이 파일은 배포본이자 테스트 대상이다.** `player.html` 이 `<script type="module">` 로
// import 하고, vitest 도 (`src/lib/retro/rom-patch.test.ts`) 같은 파일을 그대로 불러 검증한다.
// TS 로 옮겨 두 벌로 나누면 배포되는 코드와 테스트되는 코드가 갈린다 — 그래서 여기 한 벌만 둔다.
// 그런 이유로 이 파일에는 빌드 단계가 없다. 브라우저가 그대로 실행할 수 있는 ES 모듈로 쓴다.
//
// 패치는 롬을 바꾸지 않는다 — 새 Uint8Array 를 만들어 돌려준다.

/** SFC 복사기 헤더 크기. */
export const HEADER_SIZE = 512;

/**
 * 복사기 헤더가 붙어 있는가.
 *
 * SFC 롬 본체는 항상 1KB 의 배수라, 512 가 남으면 앞에 헤더가 붙은 것이다.
 * `.smc` 는 붙은 경우가 많고 `.sfc` 는 대개 없다.
 */
export function hasCopierHeader(rom) {
  return rom.length % 1024 === HEADER_SIZE;
}

/** 매직으로 형식을 가린다. 모르면 null — 모르는 걸 아는 척하면 롬이 조용히 망가진다. */
export function detectPatchFormat(patch) {
  if (!patch || patch.length < 4) return null;
  const magic = String.fromCharCode(...patch.slice(0, 5));
  if (magic.startsWith('PATCH')) return 'ips';
  if (magic.startsWith('BPS1')) return 'bps';
  if (magic.startsWith('UPS1')) return 'ups';
  return null;
}

// ── CRC32 ────────────────────────────────────────────────────────────────────
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c;
  }
  return CRC_TABLE;
}

/** 표준 CRC-32 (BPS·UPS 의 검증값). */
export function crc32(bytes) {
  const t = crcTable();
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ── IPS ──────────────────────────────────────────────────────────────────────
function applyIps(rom, patch) {
  let p = 5; // "PATCH"
  const out = Array.from(rom);
  let sawEof = false;

  while (p < patch.length) {
    if (p + 3 > patch.length) throw new Error('패치가 중간에서 끊겼습니다.');
    if (patch[p] === 0x45 && patch[p + 1] === 0x4f && patch[p + 2] === 0x46) { // "EOF"
      sawEof = true;
      p += 3;
      // EOF 뒤 3 바이트는 "여기까지만 남겨라"(truncate extension). 있으면 존중한다.
      if (p + 3 <= patch.length) {
        const truncate = (patch[p] << 16) | (patch[p + 1] << 8) | patch[p + 2];
        out.length = truncate;
      }
      break;
    }

    const offset = (patch[p] << 16) | (patch[p + 1] << 8) | patch[p + 2];
    p += 3;
    if (p + 2 > patch.length) throw new Error('패치가 중간에서 끊겼습니다.');
    const size = (patch[p] << 8) | patch[p + 1];
    p += 2;

    if (size === 0) {
      // RLE — 같은 값을 반복해 채운다.
      if (p + 3 > patch.length) throw new Error('패치가 중간에서 끊겼습니다.');
      const count = (patch[p] << 8) | patch[p + 1];
      const value = patch[p + 2];
      p += 3;
      for (let i = 0; i < count; i++) out[offset + i] = value;
    } else {
      if (p + size > patch.length) throw new Error('패치가 중간에서 끊겼습니다.');
      for (let i = 0; i < size; i++) out[offset + i] = patch[p + i];
      p += size;
    }
  }

  if (!sawEof) throw new Error('IPS 패치에 EOF 표시가 없습니다 — 파일이 온전하지 않습니다.');
  // 롬 끝을 넘겨 쓴 자리는 빈 칸으로 남으므로 0 으로 메운다.
  for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = 0;
  return new Uint8Array(out);
}

// ── BPS / UPS 공통 ───────────────────────────────────────────────────────────
function readVarint(patch, state) {
  let data = 0;
  let shift = 1;
  for (;;) {
    if (state.p >= patch.length) throw new Error('패치가 중간에서 끊겼습니다.');
    const x = patch[state.p++];
    data += (x & 0x7f) * shift;
    if (x & 0x80) break;
    shift *= 128;
    data += shift;
  }
  return data;
}

function readLe32(bytes, at) {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}

function applyBps(source, patch) {
  const state = { p: 4 }; // "BPS1"
  const sourceSize = readVarint(patch, state);
  const targetSize = readVarint(patch, state);
  const metaSize = readVarint(patch, state);
  state.p += metaSize;

  if (patch.length < 12) throw new Error('BPS 패치가 너무 짧습니다.');
  const wantSourceCrc = readLe32(patch, patch.length - 12);
  const wantTargetCrc = readLe32(patch, patch.length - 8);

  if (source.length !== sourceSize || crc32(source) !== wantSourceCrc) {
    throw new Error('이 패치는 지금 롬과 맞지 않습니다 (CRC 불일치).');
  }

  const target = new Uint8Array(targetSize);
  const end = patch.length - 12;
  let outPos = 0;
  let sourceRel = 0;
  let targetRel = 0;

  while (state.p < end) {
    const cmd = readVarint(patch, state);
    const action = cmd & 3;
    const length = (cmd >> 2) + 1;

    if (action === 0) {
      for (let i = 0; i < length; i++, outPos++) target[outPos] = source[outPos];
    } else if (action === 1) {
      for (let i = 0; i < length; i++, outPos++) target[outPos] = patch[state.p++];
    } else if (action === 2) {
      const raw = readVarint(patch, state);
      sourceRel += (raw & 1 ? -1 : 1) * (raw >> 1);
      for (let i = 0; i < length; i++, outPos++, sourceRel++) target[outPos] = source[sourceRel];
    } else {
      const raw = readVarint(patch, state);
      targetRel += (raw & 1 ? -1 : 1) * (raw >> 1);
      for (let i = 0; i < length; i++, outPos++, targetRel++) target[outPos] = target[targetRel];
    }
  }

  if (crc32(target) !== wantTargetCrc) {
    throw new Error('패치 결과가 기대한 값과 다릅니다 (CRC 불일치).');
  }
  return target;
}

function applyUps(source, patch) {
  const state = { p: 4 }; // "UPS1"
  const sourceSize = readVarint(patch, state);
  const targetSize = readVarint(patch, state);

  if (patch.length < 12) throw new Error('UPS 패치가 너무 짧습니다.');
  const wantSourceCrc = readLe32(patch, patch.length - 12);
  const wantTargetCrc = readLe32(patch, patch.length - 8);

  if (source.length !== sourceSize || crc32(source) !== wantSourceCrc) {
    throw new Error('이 패치는 지금 롬과 맞지 않습니다 (CRC 불일치).');
  }

  const target = new Uint8Array(targetSize);
  target.set(source.subarray(0, Math.min(sourceSize, targetSize)));

  const end = patch.length - 12;
  let pos = 0;
  while (state.p < end) {
    pos += readVarint(patch, state);
    for (;;) {
      if (state.p >= end) throw new Error('패치가 중간에서 끊겼습니다.');
      const x = patch[state.p++];
      if (x === 0) { pos++; break; }
      if (pos < targetSize) target[pos] ^= x;
      pos++;
    }
  }

  if (crc32(target) !== wantTargetCrc) {
    throw new Error('패치 결과가 기대한 값과 다릅니다 (CRC 불일치).');
  }
  return target;
}

// ── 진입점 ───────────────────────────────────────────────────────────────────
/**
 * 롬에 패치를 적용한다.
 *
 * @param rom   원본 바이트
 * @param patch 패치 바이트
 * @param opts  { stripHeader?: boolean }
 *   - 지정하지 않으면: **BPS·UPS 는 CRC 로 맞는 해석을 자동 선택**하고(헤더 유무 둘 다 시도),
 *     IPS 는 헤더가 감지되면 "떼고 적용"을 기본으로 한다(번역 패치의 관행).
 *   - 지정하면 그대로 따른다 — IPS 결과가 이상할 때 사용자가 뒤집을 수 있어야 한다.
 * @returns { rom, format, headerStripped }
 */
export function applyRomPatch(rom, patch, opts = {}) {
  const format = detectPatchFormat(patch);
  if (!format) throw new Error('지원하지 않는 패치 형식입니다 (IPS·BPS·UPS 만 됩니다).');

  const headered = hasCopierHeader(rom);
  const apply = format === 'ips' ? applyIps : format === 'bps' ? applyBps : applyUps;

  // 헤더를 뗀 뒤 패치하고, 결과는 헤더 없이 돌려준다.
  // 헤더는 복사기가 붙인 군더더기라 에뮬레이터가 알아서 무시하지만, 패치 기준이 본문이면
  // 떼고 맞춰야 오프셋이 어긋나지 않는다.
  const run = (strip) => ({
    rom: apply(strip ? rom.subarray(HEADER_SIZE) : rom, patch),
    format,
    headerStripped: strip,
  });

  if (typeof opts.stripHeader === 'boolean') return run(opts.stripHeader);

  if (format === 'ips') {
    // 검증값이 없어 자동으로 고를 수 없다. 헤더가 보이면 관행(떼고 적용)을 따르고,
    // 결과가 이상하면 화면의 토글로 뒤집는다.
    return run(headered);
  }

  // BPS·UPS 는 CRC 가 있으니 **실제로 맞는 쪽**을 찾는다.
  // 크기 휴리스틱(hasCopierHeader)에 기대지 않는 이유: 그건 어림짐작이고 CRC 는 확답이다.
  try {
    return run(false);
  } catch (err) {
    if (rom.length > HEADER_SIZE) {
      try {
        return run(true);
      } catch {
        // 떼고도 안 맞으면 애초에 다른 롬이다 — 원래 오류가 더 정확하다.
      }
    }
    throw err;
  }
}
