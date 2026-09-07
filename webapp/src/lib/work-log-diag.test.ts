// 무엇을 받아들일까 (#409) — 판단만 본다. 저장은 route.test.ts 가 본다.
import { describe, it, expect } from 'vitest';
import { parseDiagUpload, MAX_DIAG_BYTES } from './work-log-diag';

describe('parseDiagUpload', () => {
  it('글이 있으면 받는다', () => {
    const r = parseDiagUpload({ versionCode: 30, versionName: '0.30', device: 'Pixel', kind: 'crash', body: '스택…' });
    expect(r).toEqual({ versionCode: 30, versionName: '0.30', device: 'Pixel', kind: 'crash', body: '스택…' });
  });

  it('글이 비면 받지 않는다', () => {
    // 빈 것을 쌓으면 최근 스무 벌 자리만 밀어낸다.
    expect(parseDiagUpload({ body: '' })).toBeNull();
    expect(parseDiagUpload({ body: '   \n ' })).toBeNull();
    expect(parseDiagUpload({})).toBeNull();
  });

  it('너무 크면 받지 않는다', () => {
    expect(parseDiagUpload({ body: 'a'.repeat(MAX_DIAG_BYTES + 1) })).toBeNull();
  });

  it('상한 딱 맞으면 받는다', () => {
    expect(parseDiagUpload({ body: 'a'.repeat(MAX_DIAG_BYTES) })).not.toBeNull();
  });

  it('한글은 바이트로 잰다', () => {
    // 글자수로 재면 한글이 세 배라 상한을 훌쩍 넘겨 받아 버린다.
    const 한글 = '가'.repeat(MAX_DIAG_BYTES / 3 + 10);
    expect(parseDiagUpload({ body: 한글 })).toBeNull();
  });

  it('버전·기기가 없어도 받는다', () => {
    // 옛 판이 올릴 수도 있다 — 그것 때문에 자취를 잃는 것이 더 나쁘다.
    const r = parseDiagUpload({ body: '스택' });
    expect(r).not.toBeNull();
    expect(r!.versionCode).toBe(0);
    expect(r!.kind).toBe('unknown');
  });

  it('이상한 versionCode 는 0 으로 둔다', () => {
    expect(parseDiagUpload({ versionCode: 'abc', body: 'x' })!.versionCode).toBe(0);
    expect(parseDiagUpload({ versionCode: -5, body: 'x' })!.versionCode).toBe(0);
  });

  it('이름표가 길면 자른다', () => {
    const r = parseDiagUpload({ device: 'D'.repeat(500), body: 'x' });
    expect(r!.device.length).toBeLessThanOrEqual(120);
  });
});
