// Scene read authorisation (#177) - the two points a penetration test found.
//
// 1) The public play API (`content/v1`) and the scene list filter `isDeleted`, but **the single GET did not**.
//    Every deletion in this repo is a soft delete, so a deleted scene stayed readable to anyone who knew its id.
// 2) The revision list and body had no authorisation at all. They are the authoring tool's metadata and anyone could read them.
//    The same problem was already fixed for post revisions (#168) - the same family.
//
// Scene ids are slugs like `kael_infirmary`, so being easy to enumerate raises the risk.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(`src/app/api/web-adventure/${p}`, 'utf8');

describe('씬 단건 GET — 삭제된 씬은 없는 것으로 본다', () => {
  const src = read('scenes/[id]/route.ts');

  it('GET 이 isDeleted 를 거른다', () => {
    // The deletion filter must go into the findOne call.
    const get = src.slice(src.indexOf('export async function GET'), src.indexOf('export async function PUT'));
    expect(get).toMatch(/isDeleted/);
  });

  it('목록·공개 API 와 같은 조건을 쓴다', () => {
    expect(read('scenes/route.ts')).toMatch(/isDeleted:\s*\{\s*\$ne:\s*true\s*\}/);
    expect(read('content/v1/route.ts')).toMatch(/isDeleted:\s*\{\s*\$ne:\s*true\s*\}/);
  });
});

describe('리비전 — 작성자만', () => {
  it('목록 GET 이 requireOwner 로 막힌다', () => {
    const src = read('scenes/[id]/revisions/route.ts');
    expect(src).toMatch(/requireOwner/);
    expect(src).toMatch(/owner instanceof NextResponse/);
  });

  it('본문 GET 이 requireOwner 로 막힌다', () => {
    const src = read('scenes/[id]/revisions/[version]/route.ts');
    expect(src).toMatch(/requireOwner/);
    expect(src).toMatch(/owner instanceof NextResponse/);
  });

  it('인가는 DB 조회보다 먼저 온다 — 존재 여부조차 알려주지 않는다', () => {
    for (const p of ['scenes/[id]/revisions/route.ts', 'scenes/[id]/revisions/[version]/route.ts']) {
      const src = read(p);
      expect(src.indexOf('requireOwner()')).toBeLessThan(src.indexOf('connectToDB()'));
    }
  });
});

describe('app-end-run — 유량 제한', () => {
  const src = read('app-end-run/route.ts');

  it('rateLimit 을 건다 — 요청마다 유료 생성이 큐에 쌓인다', () => {
    expect(src).toMatch(/rateLimit/);
    expect(src).toMatch(/clientIp/);
    expect(src).toMatch(/429/);
  });

  // It has to be compared against **the call site**, not the import line, to mean anything.
  it('유량 제한이 큐 적재보다 먼저 온다', () => {
    expect(src.indexOf('rateLimit(`')).toBeLessThan(src.indexOf('await enqueueFeedbackNote('));
  });

  it('인증 실패가 유량 제한보다 먼저 온다 — 키 없는 요청이 남의 몫을 깎지 않게', () => {
    expect(src.indexOf("!== key")).toBeLessThan(src.indexOf('rateLimit(`'));
  });
});

// #179 - scene **writes** used `requireAuth`. This site has open sign-up (anyone with a Google account),
// so merely signing up let someone create, edit and delete the game's content. Scenes are content the site
// publishes, so only the author (the owner) should touch them.
describe('씬 쓰기 — 작성자만 (#179)', () => {
  const writes: [string, string][] = [
    ['생성 POST', 'scenes/route.ts'],
    ['수정 PUT · 삭제 DELETE', 'scenes/[id]/route.ts'],
    ['리비전 복원 POST', 'scenes/[id]/restore/route.ts'],
  ];

  it.each(writes)('%s 는 requireOwner 를 쓴다', (_label, path) => {
    const src = read(path);
    expect(src).toMatch(/requireOwner/);
    // It must not be left as requireAuth, which merely needs a login.
    expect(src).not.toMatch(/requireAuth/);
  });

  it('읽기는 그대로 공개다 — 앱·플레이가 씬을 받아 간다', () => {
    const list = read('scenes/route.ts');
    const get = list.slice(list.indexOf('export async function GET'), list.indexOf('export async function POST'));
    expect(get).not.toMatch(/requireOwner|requireAuth/);
    expect(read('content/v1/route.ts')).not.toMatch(/requireOwner|requireAuth/);
  });
});

// The authoring screens themselves are author-only too - the scene editor, the graph and the feedback notes were open to anyone.
describe('/scenes 작성 도구 화면 (#179)', () => {
  it('레이아웃이 requireOwner 로 막는다', () => {
    const src = readFileSync('src/app/scenes/layout.tsx', 'utf8');
    expect(src).toMatch(/requireOwner/);
    expect(src).toMatch(/notFound\(\)/);
  });

  it('미들웨어의 빠른 차단 목록에도 들어간다', () => {
    const mw = readFileSync('src/middleware.ts', 'utf8');
    expect(mw).toMatch(/'\/scenes\/'/);
  });
});
