// 예전 이름으로 남은 게임 세이브(SRAM) 되살리기 (#175).
//
// 배경은 `legacy-save.test.ts` 머리말에 적어 뒀다. 요약하면 #137 에서 롬 주소 끝이
// `.../file` → `.../file/<id>.sfc` 로 바뀌면서, 코어가 배터리 세이브를 찾는 이름이
// `file.srm` 에서 `<id>.srm` 으로 옮겨 갔다. 파일은 브라우저에 그대로 있는데 이름만 어긋난다.
//
// 여기는 **순수 계산만** 한다 — FS 도 emulator 도 모른다. 실제 복사는 player.js 가 한다.

/**
 * EmulatorJS 가 쓰는 것과 같은 방식으로 콘텐츠 이름을 뽑는다.
 *
 * `saveDatabaseLoaded` 시점엔 `emulator.fileName` 이 아직 없고(실측) `config.gameUrl` 만
 * 있다. EmulatorJS 도 결국 주소의 마지막 조각을 쓰므로 같은 규칙을 따른다.
 *
 * @returns 확장자를 뗀 이름. 판단할 수 없으면 빈 문자열(호출측이 건너뛴다).
 */
export function baseFromGameUrl(gameUrl) {
  if (typeof gameUrl !== 'string' || !gameUrl) return '';
  // blob: 은 마지막 조각이 임의의 uuid 라 세이브 이름의 근거가 못 된다.
  if (gameUrl.startsWith('blob:')) return '';
  const last = gameUrl.split('/').pop().split('#')[0].split('?')[0];
  if (!last) return '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // 잘못된 인코딩이면 원문 그대로 쓴다.
  }
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** #137 이전 세이브가 모여 있던 이름. 확장자는 코어마다 다르다. */
const LEGACY_BASE = 'file';

/**
 * 무엇을 어디로 복사할지 정한다.
 *
 * **복사**이지 이동이 아니다. 원본은 남겨 둔다 — 잘못 짚었을 때 되돌릴 자리가 필요하다.
 *
 * @param entries  세이브 디렉터리(`/data/saves/<코어>`) 안의 파일 이름들
 * @param targetBase  이 게임이 쓸 이름(확장자 제외)
 * @returns `[{from, to}]`. 할 일이 없으면 빈 배열.
 */
export function planLegacySaveRestore({ entries, targetBase }) {
  const names = Array.isArray(entries) ? entries : [];
  const base = typeof targetBase === 'string' ? targetBase : '';
  // 대상이 없거나 아직 옛 이름 그대로면 자기 자신을 덮어쓰게 된다.
  if (!base || base === LEGACY_BASE) return [];

  // 이 게임 이름으로 이미 뭔가 저장돼 있으면 그게 최신이다. 덮어쓰면 진짜로 잃는다.
  const mine = (n) => n === base || n.startsWith(base + '.');
  if (names.some(mine)) return [];

  const legacy = (n) => n === LEGACY_BASE || n.startsWith(LEGACY_BASE + '.');
  return names.filter(legacy).map((n) => ({
    from: n,
    to: n === LEGACY_BASE ? base : base + n.slice(LEGACY_BASE.length),
  }));
}
