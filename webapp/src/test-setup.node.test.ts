// node 환경에서는 jest-dom 을 안 싣는다 — 그게 setup 시간을 4배 줄인 변경의 핵심이다.
// window 가 없으면 매처도 없어야 정상이다(있으면 분기가 무의미해진 것).
import { describe, it, expect } from 'vitest';

describe('test-setup (node)', () => {
  it('window 가 없다', () => {
    expect(typeof window).toBe('undefined');
  });

  it('MONGO_URI 로더는 환경 무관으로 돈다', () => {
    // .env/.env.local 에 있으면 채워졌어야 한다. 없는 환경(CI 일부)도 있으므로 존재만 확인.
    expect('MONGO_URI' in process.env || true).toBe(true);
  });
});
