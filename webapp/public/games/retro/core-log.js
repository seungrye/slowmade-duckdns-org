// 코어 로그에서 "왜 안 떴는지" 만 추려 낸다 (#153).
//
// 아케이드 코어는 롬셋을 못 읽어도 예외를 던지지 않는다 — 조용히 RetroArch 메뉴를 띄운다.
// 사용자 눈에는 검은 화면이나 낯선 설정 화면만 보이고, 정작 원인(`ddsoma.key` 가 없다)은
// 콘솔 수백 줄 안에 묻힌다. 그 한 줄을 건져 화면에 올리는 것이 이 모듈의 일이다.
//
// 검색 경로 나열이 수십 줄씩 나오므로 소음을 걷어 내는 쪽이 더 중요하다.

/** 그대로 보여 줄 만한 줄인가 — 진짜 원인만. */
const KEEP = /is required|Failed to load content|unknown crc|Patched romset found/;
/** 양이 많고 정보가 없는 줄. */
const NOISE = /No romset found|No patched romset|Translation not found|Using ROM with known/;

const MAX_LINES = 20;

/**
 * @param {string[]} lines 콘솔에 찍힌 코어 로그
 * @returns {{failed: boolean, missing: string[], patched: boolean, lines: string[]}}
 */
export function pickLoadErrors(lines) {
  const out = { failed: false, missing: [], patched: false, lines: [] };
  if (!Array.isArray(lines)) return out;

  const seen = new Set();
  for (const raw of lines) {
    const line = String(raw ?? '');
    if (NOISE.test(line)) continue;
    if (!KEEP.test(line)) continue;

    if (/Failed to load content|is required/.test(line)) out.failed = true;
    if (/Patched romset found|from archive .*\/patched\//.test(line)) out.patched = true;

    // `ROM at index 20 with name ddsoma.key and CRC 0x8c3cc560 is required`
    const m = line.match(/with name (\S+) and CRC \S+ is required/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      out.missing.push(m[1]);
    }

    if (out.lines.length < MAX_LINES) out.lines.push(line);
  }
  return out;
}
