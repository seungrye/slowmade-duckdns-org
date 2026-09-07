import { describe, expect, it } from 'vitest';
import { assetObjectKey } from './work-log-ink-assets';

// 앱이 준 이름이 그대로 MinIO 키가 되면 `../` 로 남의 객체를 집을 수 있다 (#415).
// APK 객체를 덮어쓰면 앱이 못 쓰는 것을 받아 설치하려 든다 — 값싼 검사로 막는다.
describe('assetObjectKey', () => {
  it('보통 이름을 자료 칸 아래 키로 바꾼다', () => {
    expect(assetObjectKey('ko_KR.zip')).toBe('work-log/ink-assets/ko_KR.zip');
  });

  it('영문·숫자·밑줄·붙임표를 받는다', () => {
    expect(assetObjectKey('en_US.zip')).toBe('work-log/ink-assets/en_US.zip');
    expect(assetObjectKey('mul-Latn2.zip')).toBe('work-log/ink-assets/mul-Latn2.zip');
  });

  it('zip 이 아니면 거절한다', () => {
    expect(assetObjectKey('ko_KR.res')).toBeNull();
    expect(assetObjectKey('ko_KR')).toBeNull();
  });

  it('빗금이 들어가면 거절한다', () => {
    expect(assetObjectKey('a/b.zip')).toBeNull();
    expect(assetObjectKey('../app-release.apk.zip')).toBeNull();
    expect(assetObjectKey('..%2Fx.zip')).toBeNull();
  });

  it('점으로만 된 이름을 거절한다', () => {
    expect(assetObjectKey('...zip')).toBeNull();
    expect(assetObjectKey('..zip')).toBeNull();
  });

  it('빈 이름을 거절한다', () => {
    expect(assetObjectKey('')).toBeNull();
    expect(assetObjectKey('   ')).toBeNull();
    expect(assetObjectKey('.zip')).toBeNull();
  });

  it('너무 긴 이름을 거절한다', () => {
    expect(assetObjectKey(`${'a'.repeat(200)}.zip`)).toBeNull();
  });

  it('한글·공백처럼 키를 지저분하게 하는 글자를 거절한다', () => {
    expect(assetObjectKey('한국어.zip')).toBeNull();
    expect(assetObjectKey('ko KR.zip')).toBeNull();
  });
});
