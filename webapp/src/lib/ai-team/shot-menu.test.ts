// 캡처가 메뉴를 펼친 뒤 찍게 하는 규칙 (#321).
//
// 네비바 드롭다운은 hover 가 아니라 클릭으로 열린다(`navbar.tsx:232`·`:394`·`:425`).
// `shot.mjs` 는 `page.goto` 직후 바로 찍어서 접힌 네비바만 나온다. `--menu` 로 논리
// 이름을 받아 뷰포트별 aria-label 순서로 번역한 뒤, 그 순서대로 눌러 펼치고 찍는다.
//
// 여기서 재는 것은 **순수 규칙**뿐이다 — 브라우저를 모는 얇은 부분은 `shot.mjs` 에 있다.
import { describe, it, expect } from 'vitest';
import { parseShotArgs, clickPlan, MENUS, SIZES } from '../../../../scripts/ai-team/shot-args.mjs';

describe('parseShotArgs — --menu 는 한 번만, 아는 이름만', () => {
  it('경로와 --menu 를 주면 menu 가 담기고 나머지는 그대로다', () => {
    expect(parseShotArgs(['/games', '--menu', '게임'])).toEqual({
      path: '/games', owner: false, port: 0, menu: '게임',
    });
  });

  // 기존 `shot-args.test.ts:10` 이 toEqual 로 세 키만 잰다. 빈 값으로라도 menu 를 담으면
  // 그 단언이 깨진다 — 옵션이 없으면 필드도 없다. toEqual 로는 값이 undefined 인 키가
  // 가려지므로 `in` 으로 잰다.
  it('--menu 를 안 주면 결과에 menu 키가 아예 없다', () => {
    const 결과 = parseShotArgs(['/games']);
    expect(결과).not.toBeNull();
    expect('menu' in 결과!).toBe(false);
  });

  it('--menu 뒤에 값이 없으면 거절한다', () => {
    expect(parseShotArgs(['/games', '--menu'])).toBeNull();
  });

  // 다음 인자를 값으로 삼키면 `--owner` 가 조용히 사라진다.
  it('--menu 뒤가 다른 옵션이면 거절한다', () => {
    expect(parseShotArgs(['/games', '--menu', '--owner'])).toBeNull();
    expect(parseShotArgs(['/games', '--menu', '--port', '3011'])).toBeNull();
  });

  it('MENUS 에 없는 이름은 거절한다', () => {
    for (const 이름 of ['주식', '마이페이지', 'games', '게임 ']) {
      expect(parseShotArgs(['/games', '--menu', 이름])).toBeNull();
    }
  });

  it('--menu 를 두 번 주면 거절한다', () => {
    expect(parseShotArgs(['/games', '--menu', '게임', '--menu', '게임'])).toBeNull();
  });

  it('--menu 와 --owner 는 순서를 바꿔 줘도 같다', () => {
    const 기대 = { path: '/', owner: true, port: 0, menu: '게임' };
    expect(parseShotArgs(['/', '--menu', '게임', '--owner'])).toEqual(기대);
    expect(parseShotArgs(['/', '--owner', '--menu', '게임'])).toEqual(기대);
  });

  // `--owner` 와 `--port` 를 함께 못 쓰는 기존 제약(`shot-args.mjs:53`)은 --menu 와 무관하다.
  it('--menu 와 --port 는 함께 쓸 수 있다', () => {
    expect(parseShotArgs(['/games', '--menu', '게임', '--port', '3011'])).toEqual({
      path: '/games', owner: false, port: 3011, menu: '게임',
    });
  });
});

describe('clickPlan — 뷰포트마다 누를 라벨 순서', () => {
  it('데스크톱 게임 메뉴는 버튼 하나다', () => {
    expect(clickPlan('게임', 'desktop')).toEqual(['게임 메뉴']);
  });

  // 햄버거를 먼저 눌러야 안쪽 토글이 화면에 있다. 순서가 뒤집히면 안 된다.
  it('모바일 게임 메뉴는 햄버거가 먼저고 섹션 토글이 나중이다', () => {
    const 계획 = clickPlan('게임', 'mobile');
    expect(계획).toEqual(['모바일 메뉴 열기', '모바일 게임 섹션 토글']);
    expect(계획.indexOf('모바일 메뉴 열기')).toBeLessThan(계획.indexOf('모바일 게임 섹션 토글'));
  });

  // 메뉴를 안 줬으면 아무것도 누르지 않는다 — 모바일이라고 햄버거를 자동으로 열지 않는다.
  it('메뉴가 없으면 빈 목록이다', () => {
    expect(clickPlan(undefined, 'desktop')).toEqual([]);
    expect(clickPlan(undefined, 'mobile')).toEqual([]);
  });

  it('모르는 이름이면 던지지 않고 빈 목록이다', () => {
    expect(() => clickPlan('주식', 'desktop')).not.toThrow();
    expect(clickPlan('주식', 'desktop')).toEqual([]);
    expect(clickPlan('마이페이지', 'mobile')).toEqual([]);
    expect(clickPlan('게임', '태블릿')).toEqual([]);
  });

  it('낸 목록을 바꿔도 표가 안 바뀐다', () => {
    const 첫 = clickPlan('게임', 'mobile');
    첫.push('엉뚱한 라벨');
    첫[0] = '망가뜨림';
    const 둘 = clickPlan('게임', 'mobile');
    expect(둘).not.toBe(첫);
    expect(둘).toEqual(['모바일 메뉴 열기', '모바일 게임 섹션 토글']);
    expect(MENUS['게임'].mobile).toEqual(['모바일 메뉴 열기', '모바일 게임 섹션 토글']);
  });

  // 뷰포트 이름이 바뀌면 이 단언이 깨져 알려 준다.
  it('SIZES 의 두 이름 각각에 대해 누를 것이 있다', () => {
    for (const size of SIZES) {
      expect(clickPlan('게임', size.name).length).toBeGreaterThan(0);
    }
  });
});
