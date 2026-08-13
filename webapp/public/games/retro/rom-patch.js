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
  // 아케이드 패치는 IPS 여러 개를 zip 으로 묶어 배포한다 (#143).
  if (patch[0] === 0x50 && patch[1] === 0x4b && patch[2] === 0x03 && patch[3] === 0x04) return 'zip';
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

// ── zip 다루기 (#143) ────────────────────────────────────────────────────────
//
// 아케이드 패치는 롬 zip **안쪽 칩 파일마다** IPS 를 먹인다. 그래서 zip 을 풀고 다시 묶어야
// 하는데, 라이브러리를 들이지 않는다 — 브라우저 표준으로 충분하다.
//   읽기: 중앙 디렉터리를 훑고, deflate 는 `DecompressionStream('deflate-raw')` 로 푼다.
//   쓰기: **무압축(method 0)** 으로 묶는다. 메모리에만 잠깐 존재하고 코어는 문제없이 읽는다.

const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;

/** zip 매직인가. */
export function isZip(bytes) {
  return !!bytes && bytes.length >= 4 &&
    bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

const u16 = (v, at) => v.getUint16(at, true);
const u32 = (v, at) => v.getUint32(at, true);

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  void w.write(bytes);
  void w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/**
 * zip 을 풀어 `{ name, data }` 목록으로. 디렉터리 항목은 뺀다.
 *
 * @throws zip 이 아니거나 구조가 깨졌으면.
 */
export async function readZip(bytes) {
  if (!bytes || bytes.length < 22) throw new Error('zip 파일이 아닙니다.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // EOCD 를 뒤에서부터 찾는다(주석이 붙어 있을 수 있다).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (u32(view, i) === ZIP_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip 파일이 아닙니다 (끝 표식을 찾지 못했습니다).');

  const count = u16(view, eocd + 10);
  let p = u32(view, eocd + 16);
  const out = [];
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (u32(view, p) !== ZIP_CENTRAL) throw new Error('zip 구조가 깨졌습니다.');
    const method = u16(view, p + 10);
    const compSize = u32(view, p + 20);
    const nameLen = u16(view, p + 28);
    const extraLen = u16(view, p + 30);
    const commentLen = u16(view, p + 32);
    const localAt = u32(view, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // 디렉터리

    if (u32(view, localAt) !== ZIP_LOCAL) throw new Error('zip 구조가 깨졌습니다.');
    const lNameLen = u16(view, localAt + 26);
    const lExtraLen = u16(view, localAt + 28);
    const dataAt = localAt + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataAt, dataAt + compSize);

    if (method === 0) out.push({ name, data: raw.slice() });
    else if (method === 8) out.push({ name, data: await inflateRaw(raw) });
    else throw new Error(`지원하지 않는 zip 압축 방식입니다 (method ${method}).`);
  }
  return out;
}

/**
 * `{ name, data }` 목록을 zip 으로 묶는다. **무압축**이다.
 *
 * @param opts.deflated 시험용 — 특정 이름을 미리 deflate 된 바이트로 넣는다.
 */
export function writeZip(entries, opts = {}) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const name = encoder.encode(e.name);
    const pre = opts.deflated && opts.deflated[e.name];
    const stored = pre ? pre : e.data;
    const method = pre ? 8 : 0;
    const crc = crc32(e.data);

    const local = new Uint8Array(30 + name.length + stored.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, ZIP_LOCAL, true);
    lv.setUint16(4, 20, true);           // version
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, stored.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(stored, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, ZIP_CENTRAL, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, stored.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, ZIP_EOCD, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const b of [...locals, ...centrals, eocd]) { out.set(b, at); at += b.length; }
  return out;
}

/** 경로·확장자를 떼고 소문자로 — 짝을 찾을 때 쓴다. */
const chipKey = (name) => (name.split('/').pop() ?? '').replace(/\.ips$/i, '').toLowerCase();

/**
 * 묶음 패치를 적용한다 (#143) — 롬 zip 안쪽 칩마다 IPS 를 먹인다.
 *
 * **이름이 짝인 것만** 건드리고 나머지는 그대로 둔다. `.`/`_` 같은 규칙 차이는 **보정하지
 * 않는다** — 억지로 맞추면 엉뚱한 칩에 패치를 먹여 조용히 망가진다.
 *
 * @throws 짝이 하나도 없으면 **양쪽 이름을 담아** 던진다. 롬셋이 다르다는 걸 바로 알 수 있게.
 */
export async function applyBundlePatch(romZip, patchZip, opts = {}) {
  const romEntries = await readZip(romZip);
  const patchEntries = (await readZip(patchZip)).filter((e) => /\.ips$/i.test(e.name));
  if (patchEntries.length === 0) {
    throw new Error('패치 묶음 안에 IPS 파일이 없습니다.');
  }

  const byKey = new Map(romEntries.map((e) => [chipKey(e.name), e]));
  let applied = 0;

  for (const p of patchEntries) {
    const target = byKey.get(chipKey(p.name));
    if (!target) continue;
    target.data = applyRomPatch(target.data, p.data, { stripHeader: false }).rom;
    applied++;
  }

  // 분할 셋은 **미리 합쳐서** 넘긴다(mergeZips) — 그러면 여기선 언제나 완전한 셋을 본다.
  if (applied === 0 && !opts.allowNoMatch) {
    throw new Error(describeMismatch(romEntries, patchEntries));
  }

  return {
    rom: writeZip(romEntries),
    applied,
    total: patchEntries.length,
    romNames: romEntries.map((e) => e.name),
    patchNames: patchEntries.map((e) => chipKey(e.name)),
  };
}

/** 짝이 하나도 없을 때 **양쪽 이름을 나란히** 보여 준다 — 원인을 바로 알 수 있게. */
export function describeMismatch(romEntries, patchEntries) {
  const show = (xs) => xs.slice(0, 6).join(', ') + (xs.length > 6 ? ' …' : '');
  const romNames = romEntries.map((e) => (typeof e === 'string' ? e : e.name));
  const patchNames = patchEntries.map((e) => (typeof e === 'string' ? e : chipKey(e.name)));
  return (
    `패치를 적용하지 못했습니다 (${patchNames.length} 개 중 0 개 짝 맞음).\n` +
    `롬 안: ${show(romNames)}\n` +
    `패치 기대: ${show(patchNames)}\n` +
    `이름 규칙이 다릅니다 — 패치와 같은 계열의 롬셋이 필요합니다.`
  );
}

/**
 * 분할(split) 롬셋을 하나로 합친다 (#143).
 *
 * 아케이드 클론 셋은 리전별 파일만 담고 나머지는 부모 zip 에 있다. 둘을 풀어 **클론이 부모를
 * 덮어쓰는** 방식으로 합치면, 코어에는 완전한 셋 하나만 넘기면 된다 — EmulatorJS 의 부모 롬
 * 연동에 기대지 않아도 되고, 패치도 한 번에 먹일 수 있다.
 *
 * @param zips 앞에서 뒤 순서로 겹쳐 쌓는다. **뒤에 온 것이 이긴다**(부모, 클론 순으로 넘길 것).
 */
export async function mergeZips(zips) {
  const merged = new Map(); // key: 소문자 이름 → { name, data }
  for (const z of zips) {
    if (!z) continue;
    for (const e of await readZip(z)) {
      // 경로가 붙어 있으면 파일명만 남긴다 — 칩 이름이 곧 키다.
      const name = e.name.split('/').pop() ?? e.name;
      merged.set(name.toLowerCase(), { name, data: e.data });
    }
  }
  return writeZip([...merged.values()]);
}
