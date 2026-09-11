// 오행 색은 두 테마를 모두 갖는다 (#461).
//
// 제보: 다크모드에서 오행 막대가 트랙과 구분이 안 된다. 원인은 `EL_COLOR` 이 한 벌뿐이고
// inline `style` 로 들어가는 것이었다 — inline style 은 `.dark` 를 못 타서 어두운 배경에도
// 밝은 배경용 색이 그대로 쓰였다.
//
// 이 화면은 로그인 뒤라 e2e 로 못 잡는다. 그래서 **CSS 를 읽어** 검사한다.
// 값을 베껴 적지 않는다 — "다 있는가"와 "충분히 떨어지는가"만 본다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ELEMENTS, EL_VAR } from './saju-labels';

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

/** `--이름: #rrggbb;` 을 블록에서 뽑는다. 오행뿐 아니라 액센트도 읽는다 (#465). */
function varsIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}

/**
 * 선언 블록 하나를 떼어 온다.
 *
 * `.dark` 를 그냥 찾으면 3행의 `@custom-variant dark (&:where(.dark, .dark *));` 가 먼저
 * 걸려 엉뚱한 블록을 읽는다(처음에 그렇게 썼다가 라이트 값을 다크로 착각했다).
 * **여는 중괄호까지** 붙여 찾는다.
 */
function blockOf(selector: string): string {
  const i = css.indexOf(`${selector} {`);
  expect(i, `${selector} 블록을 globals.css 에서 못 찾았다`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
}

const light = varsIn(blockOf(':root'));
const dark = varsIn(blockOf('.dark'));

/** 상대 휘도 (WCAG). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 막대가 놓이는 트랙 — `bg-gray-200` / `dark:bg-gray-700`. */
const TRACK_LIGHT = '#e5e7eb';
const TRACK_DARK = '#374151';

/** 막대가 어디서 끝나는지 보이려면 이만큼은 떨어져야 한다. */
const MIN_TRACK_CONTRAST = 3;

describe('오행 색 — 두 테마 모두 정의된다', () => {
  it('EL_VAR 가 다섯 오행을 빠짐없이 가리킨다', () => {
    for (const el of ELEMENTS) {
      expect(EL_VAR[el], `${el}`).toMatch(/^var\(--el-[a-z]+\)$/);
    }
  });

  it('가리키는 변수가 globals.css 에 실제로 있다 — 이름만 맞추고 안 넣으면 투명해진다', () => {
    for (const el of ELEMENTS) {
      const name = EL_VAR[el].slice('var('.length, -1);
      expect(light[name], `light ${el} (${name})`).toBeDefined();
      expect(dark[name], `dark ${el} (${name})`).toBeDefined();
    }
  });
});

describe('막대가 트랙과 떨어진다', () => {
  it('다크모드에서 충분히 떨어진다 — 이게 제보의 내용이다', () => {
    for (const el of ELEMENTS) {
      const hex = dark[EL_VAR[el].slice(4, -1)];
      expect(contrast(hex, TRACK_DARK), `${el} ${hex} vs 트랙`).toBeGreaterThanOrEqual(
        MIN_TRACK_CONTRAST,
      );
    }
  });

  it('라이트모드도 같이 지킨다 — 한쪽만 고치면 다른 쪽이 무너진다', () => {
    for (const el of ELEMENTS) {
      const hex = light[EL_VAR[el].slice(4, -1)];
      expect(contrast(hex, TRACK_LIGHT), `${el} ${hex} vs 트랙`).toBeGreaterThanOrEqual(
        MIN_TRACK_CONTRAST,
      );
    }
  });

  it('두 테마가 서로 다른 값이다 — 안 그러면 고친 게 아니다', () => {
    const same = ELEMENTS.filter((el) => {
      const n = EL_VAR[el].slice(4, -1);
      return light[n] === dark[n];
    });
    expect(same, '두 테마가 같은 오행').toHaveLength(0);
  });
});

// ── OLED 청색 부담 (#465) ─────────────────────────────────────────
//
// 제보: 기기가 OLED 라 청색 계열이 부담될 것 같다. 근거가 맞다 — 청색 서브픽셀의 열화율은
// 적·녹의 2~3배다. 그래서 다크 테마에서 줄여야 할 것은 "어두움"이 아니라 **청색 채널**이다.
//
// 색은 화면에서만 판단되지만 이 화면은 로그인 뒤라 e2e 로 못 잡는다. 성질로 건다.

/** 청색이 이보다 높으면서 적·녹보다 확실히 앞서면 OLED 에 부담이다. */
const BLUE_HEAVY = 170;
const BLUE_LEAD = 25;

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function isBlueHeavy(hex: string): boolean {
  const [r, g, b] = channels(hex);
  return b > BLUE_HEAVY && b > Math.max(r, g) + BLUE_LEAD;
}

describe('다크 오행에 청색 부담이 없다 (#465)', () => {
  it('어느 오행도 청색에 기대지 않는다', () => {
    for (const el of ELEMENTS) {
      const hex = dark[EL_VAR[el].slice(4, -1)];
      const [r, g, b] = channels(hex);
      expect(isBlueHeavy(hex), `${el} ${hex} (R${r} G${g} B${b})`).toBe(false);
    }
  });

  it('라이트는 건드리지 않았다 — OLED 부담은 다크에서만 생긴다', () => {
    // 밝은 배경에서는 화소가 어차피 다 켜져 있어 청색만 줄일 이유가 없다.
    // 여기서는 "라이트에도 값이 있다"만 본다(위 블록이 대비를 이미 지킨다).
    for (const el of ELEMENTS) {
      expect(light[EL_VAR[el].slice(4, -1)], `light ${el}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('액센트도 테마를 탄다 (#465)', () => {
  const NAMES = ['--accent', '--accent-ink', '--accent-line'];

  it('세 토큰이 두 테마 모두에 있다', () => {
    for (const n of NAMES) {
      expect(light[n], `light ${n}`).toBeDefined();
      expect(dark[n], `dark ${n}`).toBeDefined();
    }
  });

  it('다크 액센트가 라이트보다 청색이 낮다 — 이게 이번 변경의 요지다', () => {
    const [, , lb] = channels(light['--accent']);
    const [, , db] = channels(dark['--accent']);
    expect(db, `light B=${lb} → dark B=${db}`).toBeLessThan(lb);
  });

  it('액센트에 청색 부담이 없다', () => {
    expect(isBlueHeavy(dark['--accent']), dark['--accent']).toBe(false);
    expect(isBlueHeavy(dark['--accent-line']), dark['--accent-line']).toBe(false);
  });

  it('액센트 위에 올린 글자가 읽힌다 — 알약·배지가 그렇게 칠해진다', () => {
    for (const [name, vars] of [['light', light], ['dark', dark]] as const) {
      expect(
        contrast(vars['--accent-ink'], vars['--accent']),
        `${name}: ${vars['--accent-ink']} on ${vars['--accent']}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
