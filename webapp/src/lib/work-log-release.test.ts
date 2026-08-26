// work_log 앱 배포 (#261) — 순수 부분.
//
// work_log 저장소는 **비공개**라 앱이 GitHub 릴리스 API 를 토큰 없이 못 부른다. APK 에
// 저장소 읽기 토큰을 심는 건 위험하다(새면 소스 전체가 열린다). 그래서 사이트가 알려 준다.
//
// 여기서 보는 건 "무엇을 받아들일 것인가" 다. 라우트는 저장소·MinIO 를 만지므로
// 판단만 떼어 두고 따로 본다.
import { describe, it, expect } from 'vitest';
import { parseReleaseUpload, APK_MIME, MAX_APK_BYTES } from './work-log-release';

describe('parseReleaseUpload — 올라온 릴리스를 받아들일까', () => {
  const ok = { versionCode: '12', versionName: '0.2', notes: '고친 것' };

  it('정상 입력을 숫자로 정리해 준다', () => {
    expect(parseReleaseUpload(ok, MAX_APK_BYTES - 1)).toEqual({
      versionCode: 12, versionName: '0.2', notes: '고친 것',
    });
  });

  it('versionCode 가 없으면 거절 — 새 버전인지 판단할 근거가 없다', () => {
    expect(parseReleaseUpload({ ...ok, versionCode: '' }, 10)).toBeNull();
  });

  it('versionCode 가 숫자가 아니면 거절', () => {
    expect(parseReleaseUpload({ ...ok, versionCode: '어제' }, 10)).toBeNull();
  });

  it('versionCode 는 1 이상이어야 한다', () => {
    expect(parseReleaseUpload({ ...ok, versionCode: '0' }, 10)).toBeNull();
  });

  it('versionName 이 없으면 거절 — 사람에게 보여 줄 이름이 필요하다', () => {
    expect(parseReleaseUpload({ ...ok, versionName: '  ' }, 10)).toBeNull();
  });

  it('notes 는 없어도 된다', () => {
    expect(parseReleaseUpload({ versionCode: '3', versionName: '0.3' }, 10)?.notes).toBe('');
  });

  // 실수로 엉뚱한 파일을 올려 앱이 못 쓰는 것을 받는 일이 없게.
  it('파일이 비었으면 거절', () => {
    expect(parseReleaseUpload(ok, 0)).toBeNull();
  });

  it('너무 크면 거절 — 디스크를 통째로 먹는 것을 막는다', () => {
    expect(parseReleaseUpload(ok, MAX_APK_BYTES + 1)).toBeNull();
  });

  it('긴 notes 는 잘라서 담는다', () => {
    const got = parseReleaseUpload({ ...ok, notes: 'ㄱ'.repeat(5000) }, 10);
    expect(got!.notes.length).toBeLessThanOrEqual(2000);
  });

  it('APK MIME 은 안드로이드가 아는 값이다 — 이걸로 내려줘야 설치 화면이 뜬다', () => {
    expect(APK_MIME).toBe('application/vnd.android.package-archive');
  });
});
