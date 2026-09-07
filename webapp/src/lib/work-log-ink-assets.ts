// work_log 손글씨 인식 자료 나눠 주기 (#415) — 순수 부분.
//
// 앱이 손글씨 엔진을 MyScript iink 로 바꾸면서(seungrye/work_log#82) 한국어 인식 자료가
// 있어야 돌게 됐다. 그런데 **최종 사용자가 MyScript 서버에서 직접 받는 것을 약관이 막는다** —
// 받는 쪽이 제 자리에 얹어 두고 나눠 줘야 한다. 그래서 APK 를 나눠 주듯 이것도 나눠 준다.

/** 자료를 두는 칸. APK(`work-log/app-release.apk`)와 나란히 둔다. */
const ASSET_DIR = 'work-log/ink-assets';

/** 이름에서 받아 줄 글자. 이것만 받으면 빗금·점·%·공백·한글이 통째로 걸러진다. */
const STEM = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 앱이 부른 파일 이름을 MinIO 키로 바꾼다. **수상하면 null** — 부르는 쪽이 400 을 돌려준다.
 *
 * 이름을 그대로 키에 이어 붙이면 `../app-release.apk` 같은 것으로 **남의 객체를 집는다.**
 * APK 를 덮어쓰면 앱이 못 쓰는 것을 받아 설치하려 든다. 그래서 받아 줄 글자를 좁게 잡고,
 * 그 밖은 전부 거절한다 — 지울 것을 고르는 것보다 받을 것을 고르는 편이 안전하다.
 */
export function assetObjectKey(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed.endsWith('.zip')) return null;

  const stem = trimmed.slice(0, -'.zip'.length);
  if (!STEM.test(stem)) return null;

  return `${ASSET_DIR}/${stem}.zip`;
}
