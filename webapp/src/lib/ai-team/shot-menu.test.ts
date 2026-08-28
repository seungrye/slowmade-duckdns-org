// 캡처가 메뉴를 펼친 뒤 찍게 한다 (#321).
//
// `shot.mjs` 는 `page.goto` 직후 바로 찍어서 **접힌 네비바**만 나온다. 네비바 드롭다운은
// hover 가 아니라 클릭으로 열린다(`navbar.tsx:232`, `:395`, `:426`). 그래서 사람이 요청한
// "게임 메뉴 안의 서버 상태" 는 지금 도구로는 화면에 아예 안 담긴다.
//
// 여기서 재는 것은 **무엇을 어떤 순서로 누르나** 뿐이다. 브라우저를 모는 얇은 부분은
// `shot.mjs` 에 있고 테스트 밖이다.
//
// 거절만 재는 블록은 두지 않았다. `--menu` 는 지금 모르는 옵션이라 `shot-args.mjs:41` 에서
// 그냥 `null` 이 나온다 — "값이 없으면 거절" 같은 단언은 **구현 없이도 오늘 통과한다.**
// 그래서 거절 단언은 전부 받아들이는 단언과 **같은 블록**에 묶었다.
import { describe, it, expect } from 'vitest';
import { MENUS, clickPlan, parseShotArgs, SIZES } from '../../../../scripts/ai-team/shot-args.mjs';

// `.mjs` 에는 타입이 없다. 빈 값·뒤바뀐 인자·모르는 이름까지 재려면 인자 수와 인덱스를
// 풀어 둔 별칭이 필요하다 — 재려는 것은 어디까지나 **런타임 동작**이다.
const 표 = MENUS as unknown as Record<string, Record<string, readonly string[]>>;
const 계획 = clickPlan as unknown as (menu?: unknown, sizeName?: unknown) => string[];
const 파싱 = parseShotArgs as unknown as (
  argv?: unknown[],
) => { path: string; owner: boolean; port: number; menu?: string } | null;

const 모바일_게임 = ['모바일 메뉴 열기', '모바일 게임 섹션 토글'];
const 모바일_에테르니아 = [...모바일_게임, '모바일 에테르니아의 추락 토글'];

// MENUS — 논리 이름에서 뷰포트별 라벨 순서로 가는 표. 얼려서 낸다.
describe('MENUS — 논리 이름에서 라벨 순서로', () => {
  it('게임과 에테르니아 두 자리를 다 안다', () => {
    // 서버 상태가 옮겨 가기 전과 뒤를 같은 도구로 찍어야 한다.
    expect(Object.keys(표).sort()).toEqual(['게임', '에테르니아']);
  });

  it('데스크톱 라벨은 마크업의 aria-label 그대로다', () => {
    expect(표['게임'].desktop).toEqual(['게임 메뉴']);
    expect(표['에테르니아'].desktop).toEqual(['게임 메뉴', '에테르니아의 추락 하위 메뉴']);
  });

  it('모바일은 햄버거부터 연다', () => {
    expect(표['게임'].mobile).toEqual(모바일_게임);
    expect(표['에테르니아'].mobile).toEqual(모바일_에테르니아);
  });

  it('SIZES 의 두 이름 모두에 순서가 있다', () => {
    // 뷰포트 이름이 어긋나면 그 크기에서만 조용히 접힌 화면이 찍힌다.
    const 이름들 = SIZES.map((s) => s.name).sort();
    for (const 논리 of ['게임', '에테르니아']) {
      expect(Object.keys(표[논리]).sort()).toEqual(이름들);
      for (const 이름 of 이름들) expect(표[논리][이름].length).toBeGreaterThan(0);
    }
  });

  it('얼려 있어 밖에서 못 고친다', () => {
    // 이 두 줄은 빈 표에서도 통과한다 — 그래서 내용 단언과 한 블록에 둔다.
    expect(Object.isFrozen(MENUS)).toBe(true);
    expect(() => {
      (표 as Record<string, unknown>)['주식'] = {};
    }).toThrow(TypeError);
    expect(표['게임'].desktop).toEqual(['게임 메뉴']);
  });
});

// clickPlan(menu, sizeName) — 그 뷰포트에서 메뉴를 펼치려면 무엇을 어떤 순서로 누르나.
describe('clickPlan — 누를 순서', () => {
  it('데스크톱은 한 번, 하위 메뉴는 두 번 누른다', () => {
    expect(계획('게임', 'desktop')).toEqual(['게임 메뉴']);
    expect(계획('에테르니아', 'desktop')).toEqual(['게임 메뉴', '에테르니아의 추락 하위 메뉴']);
  });

  it('모바일은 햄버거를 먼저 열고 섹션을 편다', () => {
    expect(계획('게임', 'mobile')).toEqual(모바일_게임);
    expect(계획('에테르니아', 'mobile')).toEqual(모바일_에테르니아);
  });

  it('메뉴를 안 주면 빈 계획 — 모바일이라도 햄버거를 자동으로 열지 않는다', () => {
    expect(계획(undefined, 'mobile')).toEqual([]);
    expect(계획(undefined, 'desktop')).toEqual([]);
    expect(계획('', 'mobile')).toEqual([]);
    expect(계획()).toEqual([]);
    // 그래도 이름을 주면 연다.
    expect(계획('게임', 'mobile')).toEqual(모바일_게임);
  });

  it('모르는 이름과 없는 뷰포트는 빈 계획이고, 던지지 않는다', () => {
    expect(() => 계획('주식', 'desktop')).not.toThrow();
    expect(계획('주식', 'desktop')).toEqual([]);
    expect(계획('게임', '태블릿')).toEqual([]);
    expect(계획('게임')).toEqual([]);
    // 인자가 뒤바뀐 경우도 빈 계획이다.
    expect(계획('desktop', '게임')).toEqual([]);
  });

  it('이름을 다듬지 않는다 — 공백이 붙거나 대소문자가 다르면 빈 계획', () => {
    for (const 이상한 of ['게임 ', ' 게임', '게 임', '\t게임']) {
      expect(계획(이상한, 'desktop')).toEqual([]);
    }
    expect(계획('게임', 'Desktop')).toEqual([]);
    expect(계획('게임', 'desktop')).toEqual(['게임 메뉴']);
  });

  it('물려받은 이름에 걸리지 않는다', () => {
    for (const 위험 of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(계획(위험, 'desktop')).toEqual([]);
    }
    expect(계획('에테르니아', 'desktop')).toEqual(['게임 메뉴', '에테르니아의 추락 하위 메뉴']);
  });

  it('매번 새 배열을 낸다 — 고쳐 써도 표가 안 바뀐다', () => {
    const 먼저 = 계획('에테르니아', 'mobile');
    expect(먼저).not.toBe(계획('에테르니아', 'mobile'));

    먼저.push('가짜 라벨');
    먼저[0] = '엉뚱한 라벨';
    expect(계획('에테르니아', 'mobile')).toEqual(모바일_에테르니아);
    expect(표['에테르니아'].mobile).toEqual(모바일_에테르니아);

    // 빈 계획도 공유하면 안 된다.
    expect(계획('주식', 'desktop')).not.toBe(계획('주식', 'desktop'));
  });
});

// parseShotArgs 에 --menu 를 더한다. 아는 이름만 받고, 다음 인자를 삼키지 않는다.
describe('parseShotArgs — --menu', () => {
  it('아는 이름은 받고, 값이 없으면 거절한다', () => {
    expect(파싱(['/games', '--menu', '게임'])).toStrictEqual({
      path: '/games',
      owner: false,
      port: 0,
      menu: '게임',
    });
    expect(파싱(['/games', '--menu'])).toBeNull();
    expect(파싱(['--menu', '게임'])).toBeNull(); // 경로가 없다
  });

  it('다음 인자를 삼키지 않는다', () => {
    // 삼키면 `--owner` 가 조용히 사라져 로그인 안 된 화면을 찍어 올린다.
    expect(파싱(['/games', '--menu', '--owner'])).toBeNull();
    expect(파싱(['/games', '--menu', '--port', '3011'])).toBeNull();
    expect(파싱(['/', '--menu', '게임', '--owner'])).toStrictEqual({
      path: '/',
      owner: true,
      port: 0,
      menu: '게임',
    });
  });

  it('MENUS 에 없는 이름은 거절한다', () => {
    for (const 없는 of ['주식', '마이페이지', '게임메뉴', 'GAME', '']) {
      expect(파싱(['/games', '--menu', 없는])).toBeNull();
    }
    expect(파싱(['/games', '--menu', '에테르니아'])).toStrictEqual({
      path: '/games',
      owner: false,
      port: 0,
      menu: '에테르니아',
    });
  });

  it('공백이 붙은 이름도 거절한다 — 다듬지 않는다', () => {
    for (const 이상한 of ['게임 ', ' 게임', '게 임', '\t게임']) {
      expect(파싱(['/games', '--menu', 이상한])).toBeNull();
    }
    expect(파싱(['/games', '--menu', '게임'])?.menu).toBe('게임');
  });

  it('두 번 주면 거절한다', () => {
    expect(파싱(['/games', '--menu', '게임', '--menu', '게임'])).toBeNull();
    expect(파싱(['/games', '--menu', '게임', '--menu', '에테르니아'])).toBeNull();
    expect(파싱(['/games', '--menu', '게임'])?.menu).toBe('게임');
  });

  it('--owner·--port 와 순서 무관하게 섞인다', () => {
    const 주인 = { path: '/', owner: true, port: 0, menu: '게임' };
    expect(파싱(['/', '--menu', '게임', '--owner'])).toStrictEqual(주인);
    expect(파싱(['/', '--owner', '--menu', '게임'])).toStrictEqual(주인);

    const 로컬 = { path: '/games', owner: false, port: 3011, menu: '게임' };
    expect(파싱(['/games', '--menu', '게임', '--port', '3011'])).toStrictEqual(로컬);
    expect(파싱(['/games', '--port', '3011', '--menu', '게임'])).toStrictEqual(로컬);
  });

  it('--menu 를 안 주면 menu 키가 아예 없고, 주면 있다', () => {
    // 빈 값으로라도 담으면 기존 `shot-args.test.ts:11` 의 세 키 비교가 깨진다.
    const 없음 = 파싱(['/games']);
    expect(없음).toStrictEqual({ path: '/games', owner: false, port: 0 });
    expect('menu' in 없음!).toBe(false);
    expect(파싱(['/games', '--menu', '게임'])).toHaveProperty('menu', '게임');
  });

  it('--menu 를 줘도 주인 세션은 공개 주소로만', () => {
    // `__Secure-` 쿠키는 http 로 안 간다(`shot-args.mjs:53`). 그 제약은 그대로다.
    expect(파싱(['/', '--owner', '--port', '3011', '--menu', '게임'])).toBeNull();
    expect(파싱(['/', '--owner', '--menu', '게임'])).toStrictEqual({
      path: '/',
      owner: true,
      port: 0,
      menu: '게임',
    });
  });

  it('--menu 를 줘도 경로 규칙은 그대로다', () => {
    for (const 밖 of ['http://evil.test/x', '//evil.test/x', '/a/../../b']) {
      expect(파싱([밖, '--menu', '게임'])).toBeNull();
    }
    expect(파싱(['/a', '/b', '--menu', '게임'])).toBeNull(); // 경로 둘
    expect(파싱(['games', '--menu', '게임'])?.path).toBe('/games'); // 앞 슬래시는 붙인다
  });
});
