// Loaded only in the jsdom files - a node-environment file (221 of 288) has no reason to pull it in every time.
// Measured: the setup total went 40s -> 10s and the whole run 43s -> 34s. Whether the matchers loaded is pinned down by test-setup.test.ts.
// (The default entry point '@testing-library/jest-dom' has a type file that is not a module, so tsc raises
//  TS2306 on a dynamic import. The vitest-specific entry point is a proper module.)
if (typeof window !== 'undefined') await import('@testing-library/jest-dom/vitest');
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// -- loading .env / .env.local (#91) ----------------------------------------
// The narrative tests (lib/web-adventure/__tests__) read the scenes from mongo, and every one of them
//     if (!process.env.MONGO_URI) return;
// starts with that. That is, with no MONGO_URI they never load the scenes and **pass silently**.
// That is exactly how they were running - 110 tests in 18 files were green having verified nothing,
// and 2 failed the moment a DB was attached.
//
// vitest does not read .env automatically the way next does, so it is filled in here. It is parsed
// by hand rather than bringing in dotenv (the same way this repository's scripts do it).
// **Only the keys needed** are taken. Bringing in the whole file breaks other tests - the upload
// tests, for instance, assume no S3-related env and expect 'test-endpoint.com',
// and a real value breaks that assumption (it actually happened).
const WANTED = ['MONGO_URI', 'MONGODB_URI'];

function loadEnvFile(name: string): void {
  const p = resolve(__dirname, '..', name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (!WANTED.includes(key)) continue;
    if (process.env[key] !== undefined) continue; // An already-given value wins
    process.env[key] = m[2].trim().replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
}
loadEnvFile('.env');
loadEnvFile('.env.local');
// The scripts differ on the key's name (MONGO_URI / MONGODB_URI), so one fills in for the other.
if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;

if (!process.env.MONGO_URI) {
  // Passing over it silently means seeing green without knowing the checks are off. It is announced loudly.
  console.warn(
    '\n[test-setup] MONGO_URI 가 없어 서사 검증(__tests__)이 실제로 돌지 않습니다.\n' +
      '            통과해도 검증된 것이 아닙니다 — .env.local 을 확인하세요.\n',
  );
}

// jsdom has no ResizeObserver or DOMMatrix, but @xyflow/react references them at mount time.
// An empty stub is enough - the tests do not check layout measurements.
// (#222 - introducing ReactFlow on /scenes/graph.)
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// jsdom has no matchMedia either. useMobile() calls it at mount time, so every test rendering a component
// that uses that hook dies (as happened in #95). The default is "not mobile".
// To check the mobile behaviour, a test changes window.matchMedia and innerWidth together.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (typeof globalThis !== 'undefined') {
  const g = globalThis as Record<string, unknown>;
  if (!g.ResizeObserver) g.ResizeObserver = StubResizeObserver;
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    if (!w.ResizeObserver) w.ResizeObserver = StubResizeObserver;
  }
}
