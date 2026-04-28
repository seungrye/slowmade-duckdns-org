import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { intEnv, validateEnv } from './env';

describe('intEnv', () => {
  const original = process.env.TEST_INT_VAR;

  afterEach(() => {
    if (original === undefined) delete process.env.TEST_INT_VAR;
    else process.env.TEST_INT_VAR = original;
  });

  it('환경변수가 없으면 기본값을 반환한다', () => {
    delete process.env.TEST_INT_VAR;
    expect(intEnv('TEST_INT_VAR', 42)).toBe(42);
  });

  it('환경변수가 유효한 정수이면 파싱해 반환한다', () => {
    process.env.TEST_INT_VAR = '100';
    expect(intEnv('TEST_INT_VAR', 42)).toBe(100);
  });

  it('환경변수가 숫자가 아니면 기본값을 반환한다', () => {
    process.env.TEST_INT_VAR = 'not-a-number';
    expect(intEnv('TEST_INT_VAR', 42)).toBe(42);
  });

  it('환경변수가 빈 문자열이면 기본값을 반환한다', () => {
    process.env.TEST_INT_VAR = '';
    expect(intEnv('TEST_INT_VAR', 42)).toBe(42);
  });
});

describe('validateEnv', () => {
  const required = ['MONGO_URI', 'MINIO_ENDPOINT', 'MINIO_ACCESSKEY', 'MINIO_SECRETKEY', 'MINIO_BUCKET'];
  const originals: Record<string, string | undefined> = {};

  beforeEach(() => {
    required.forEach((key) => {
      originals[key] = process.env[key];
      process.env[key] = `test-${key}`;
    });
  });

  afterEach(() => {
    required.forEach((key) => {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    });
  });

  it('필수 환경변수가 모두 설정되면 예외를 던지지 않는다', () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it('MONGO_URI가 없으면 예외를 던진다', () => {
    delete process.env.MONGO_URI;
    expect(() => validateEnv()).toThrow('MONGO_URI');
  });

  it('MINIO 환경변수가 없으면 예외를 던진다', () => {
    delete process.env.MINIO_ENDPOINT;
    expect(() => validateEnv()).toThrow('MINIO_ENDPOINT');
  });

  it('여러 환경변수가 없으면 누락된 이름을 모두 포함해 던진다', () => {
    delete process.env.MONGO_URI;
    delete process.env.MINIO_BUCKET;
    expect(() => validateEnv()).toThrow(/MONGO_URI.*MINIO_BUCKET|MINIO_BUCKET.*MONGO_URI/);
  });
});
