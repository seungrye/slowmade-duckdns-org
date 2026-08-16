// 씬 열람 인가 (#177) — 침투 테스트에서 나온 두 지점.
//
// 1) 공개 재생 API(`content/v1`)와 씬 목록은 `isDeleted` 를 거르는데 **단건 GET 은 안 걸렀다**.
//    이 저장소는 모든 삭제를 soft-delete 로 하므로, 씬을 지워도 id 만 알면 계속 읽혔다.
// 2) 리비전 목록·본문은 인가가 아예 없었다. 작성 도구의 메타데이터인데 누구나 읽었다.
//    글 리비전에서 이미 같은 문제를 고쳤다(#168) — 같은 계열이다.
//
// 씬 id 는 `kael_infirmary` 같은 슬러그라 열거가 쉽다는 점이 위험을 키운다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(`src/app/api/web-adventure/${p}`, 'utf8');

describe('씬 단건 GET — 삭제된 씬은 없는 것으로 본다', () => {
  const src = read('scenes/[id]/route.ts');

  it('GET 이 isDeleted 를 거른다', () => {
    // findOne 호출에 삭제 필터가 함께 들어가야 한다.
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

  // import 줄이 아니라 **호출 지점**과 비교해야 의미가 있다.
  it('유량 제한이 큐 적재보다 먼저 온다', () => {
    expect(src.indexOf('rateLimit(`')).toBeLessThan(src.indexOf('await enqueueFeedbackNote('));
  });

  it('인증 실패가 유량 제한보다 먼저 온다 — 키 없는 요청이 남의 몫을 깎지 않게', () => {
    expect(src.indexOf("!== key")).toBeLessThan(src.indexOf('rateLimit(`'));
  });
});

// #179 — 씬 **쓰기**가 `requireAuth` 였다. 이 사이트는 가입이 열려 있어(구글 계정이면 누구나),
// 가입만 하면 남이 게임 내용을 만들고 고치고 지울 수 있었다. 씬은 사이트가 퍼블리싱하는
// 콘텐츠이므로 작성자(owner)만 손대야 한다.
describe('씬 쓰기 — 작성자만 (#179)', () => {
  const writes: [string, string][] = [
    ['생성 POST', 'scenes/route.ts'],
    ['수정 PUT · 삭제 DELETE', 'scenes/[id]/route.ts'],
    ['리비전 복원 POST', 'scenes/[id]/restore/route.ts'],
  ];

  it.each(writes)('%s 는 requireOwner 를 쓴다', (_label, path) => {
    const src = read(path);
    expect(src).toMatch(/requireOwner/);
    // 로그인만 하면 되는 requireAuth 로 남아 있으면 안 된다.
    expect(src).not.toMatch(/requireAuth/);
  });

  it('읽기는 그대로 공개다 — 앱·플레이가 씬을 받아 간다', () => {
    const list = read('scenes/route.ts');
    const get = list.slice(list.indexOf('export async function GET'), list.indexOf('export async function POST'));
    expect(get).not.toMatch(/requireOwner|requireAuth/);
    expect(read('content/v1/route.ts')).not.toMatch(/requireOwner|requireAuth/);
  });
});

// 작성 도구 화면 자체도 작성자만 — 씬 편집기·그래프·피드백 노트가 누구에게나 열려 있었다.
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
