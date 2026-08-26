// work_log 앱 배포 (#261) — 순수 부분.
//
// work_log(업무 노트 안드로이드 앱)에 앱 안에서 업데이트를 넣는다. 에테르니아는 GitHub
// 릴리스 API 를 직접 보지만(`eternia-app/src/update-check.js`), **work_log 저장소는
// 비공개**라 앱이 토큰 없이 그 API 를 못 부른다. APK 에 저장소 읽기 토큰을 심으면 새는
// 순간 소스 전체가 열린다 — 위험이 다르다.
//
// 그래서 사이트가 알려 준다. 릴리스 워크플로가 새 APK 를 올리고, 앱은 사이트만 본다.

/** 안드로이드가 아는 APK MIME. 이 값으로 내려줘야 설치 화면이 뜬다. */
export const APK_MIME = 'application/vnd.android.package-archive';

/** 받아 줄 APK 상한. 지금 릴리스가 20MB 남짓이라 넉넉하다. */
export const MAX_APK_BYTES = 200 * 1024 * 1024;

/** 바뀐 내용 설명 상한 — 알림에 한두 줄 보여 줄 뿐이다. */
const MAX_NOTES = 2000;

export interface ReleaseUpload {
  versionCode: number;
  versionName: string;
  notes: string;
}

/**
 * 올라온 릴리스를 받아들일지 판단한다.
 *
 * `versionCode` 를 반드시 요구한다 — 앱이 "새 버전인가"를 이 숫자로만 판단하므로, 없으면
 * 올려 봐야 아무도 업데이트를 받지 못한다. 이름(`0.2`) 비교는 자리수·접두사에 따라
 * 어긋날 여지가 있어 판단 근거로 쓰지 않는다.
 *
 * @returns 받아들일 값, 또는 거절이면 `null`.
 */
export function parseReleaseUpload(
  input: { versionCode?: unknown; versionName?: unknown; notes?: unknown },
  fileSize: number,
): ReleaseUpload | null {
  const code = Number(String(input.versionCode ?? '').trim());
  if (!Number.isInteger(code) || code < 1) return null;

  const name = String(input.versionName ?? '').trim();
  if (!name) return null;

  // 빈 파일이나 터무니없이 큰 파일은 실수로 본다 — 앱이 못 쓰는 것을 담아 두지 않는다.
  if (fileSize <= 0 || fileSize > MAX_APK_BYTES) return null;

  return {
    versionCode: code,
    versionName: name,
    notes: String(input.notes ?? '').slice(0, MAX_NOTES),
  };
}
