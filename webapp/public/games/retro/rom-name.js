// 코어에 넘길 롬 파일명 (#148).
//
// 패치를 거치면 원본 주소가 아니라 **메모리에서 만든 File** 을 EmulatorJS 에 넘긴다.
// 그때 이름을 우리가 정해 줘야 한다.
//
// **아케이드는 파일명이 곧 롬셋 이름**이다(`ddsoma.zip` → 드라이버 `ddsoma`). EmulatorJS 는
// File 을 받으면 `config.gameUrl` 을 `File.name` 으로 바꾼 뒤
// (`gameUrl instanceof File ? gameUrl = gameUrl.name : …`), 아케이드 코어에서는 그 이름으로
// 가상 파일시스템에 쓴다(`FS.writeFile(getBaseFileName(true), …)`). 이름이 틀어지면 코어가
// 롬셋을 못 찾아 **게임 대신 설정 화면**이 뜬다 — 원본 주소의 마지막 조각을 그대로 살린다.

/**
 * 롬 주소에서 코어에 넘길 파일명을 뽑는다.
 *
 * @param {string} url 롬을 받아 온 같은 출처 주소
 * @param {string} fallbackExt 확장자가 없을 때 붙일 것 (코어별 — sfc·zip)
 * @returns {string} 경로 조각이 없는 안전한 파일명
 */
export function romFileNameFromUrl(url, fallbackExt = 'bin') {
  const last = String(url ?? '')
    .split('#')[0]
    .split('?')[0]
    .split('/')
    .pop();

  let name = last ?? '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // 망가진 % 이스케이프 — 원문 그대로 쓴다. 이름 하나 때문에 실행을 막지는 않는다.
  }

  // 디코딩하면 `%2F` 가 `/` 로 되살아난다. 이 값은 그대로 가상 파일시스템의 writeFile 경로가
  // 되므로 구분자를 남기지 않는다.
  name = name.replace(/[/\\]/g, '_').trim();

  if (!name) return `game.${fallbackExt}`;
  return /\.[^.]+$/.test(name) ? name : `${name}.${fallbackExt}`;
}
