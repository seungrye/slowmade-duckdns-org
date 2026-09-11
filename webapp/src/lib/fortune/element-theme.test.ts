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

/** `--el-xxx: #rrggbb;` 을 블록에서 뽑는다. */
function varsIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--el-[a-z]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
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
