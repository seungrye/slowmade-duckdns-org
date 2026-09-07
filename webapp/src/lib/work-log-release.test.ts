// work_log app distribution (#261) - the pure part.
//
// The work_log repo is **private**, so the app cannot call GitHub's releases API without a token. Embedding a repo
// read token in the APK is dangerous (a leak opens the whole source). So the site tells it instead.
//
// What is checked here is "what to accept". The route touches the repo and MinIO, so the judgement is split out
// and checked separately.
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

  // So an accidentally uploaded wrong file never has the app downloading something unusable.
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
