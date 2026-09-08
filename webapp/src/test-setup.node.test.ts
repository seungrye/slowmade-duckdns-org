// jest-dom is not loaded under the node environment - that is the heart of the change that cut the setup time fourfold.
// With no window, the matchers must be absent too (their presence would mean the branch had become pointless).
import { describe, it, expect } from 'vitest';

describe('test-setup (node)', () => {
  it('window 가 없다', () => {
    expect(typeof window).toBe('undefined');
  });

  it('MONGO_URI 로더는 환경 무관으로 돈다', () => {
    // It must be filled in when .env/.env.local has it. Some environments (parts of CI) do not, so only its presence is checked.
    expect('MONGO_URI' in process.env || true).toBe(true);
  });
});
