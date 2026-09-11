// 조사 고르기 (#463).
//
// 로그가 `메스 을(를) 썼다.` 로 나왔다. 받침에 따라 골라야 한다.
//
// 이름은 콘텐츠에서 오므로 한글만 온다는 보장이 없다 — 한자·숫자·영문·괄호가 섞일 수 있다.
// 그런 경우에도 문장이 깨지지 않는 것이 여기서 지키는 것이다.

import { describe, it, expect } from 'vitest';
import { withJosa, eulReul } from './josa';

describe('eulReul — 받침이 있으면 을, 없으면 를', () => {
  it('받침이 있으면 을', () => {
    // 실제 카드·인물 이름에서 기계로 골랐다 — 손으로 고르다 두 번 틀렸다.
    for (const w of ['무흔', '카엘', '린', '솔웬', '달의 각인', '셀레네의 완력']) {
      expect(eulReul(w), w).toBe('을');
    }
  });

  it('받침이 없으면 를', () => {
    for (const w of ['루나', '셀레네', '헤카테', '메스', '군용 붕대', '과부하']) {
      expect(eulReul(w), w).toBe('를');
    }
  });
});

describe('eulReul — 한글이 아닌 끝', () => {
  it('숫자는 읽는 소리로 고른다', () => {
    expect(eulReul('카드 1')).toBe('을'); // 일
    expect(eulReul('카드 2')).toBe('를'); // 이
    expect(eulReul('카드 3')).toBe('을'); // 삼
    expect(eulReul('카드 6')).toBe('을'); // 육
    expect(eulReul('카드 5')).toBe('를'); // 오
  });

  it('영문·한자·기호로 끝나도 문장을 깨지 않는다', () => {
    for (const w of ['TQQQ', '丙', 'card(x)', '???', '']) {
      expect(['을', '를'], w).toContain(eulReul(w));
    }
  });
});

describe('withJosa — 이름과 조사를 붙인다', () => {
  it('이름 뒤에 바로 붙는다 — 사이에 공백이 없다', () => {
    expect(withJosa('메스')).toBe('메스를');
    expect(withJosa('군용 붕대')).toBe('군용 붕대를');
    expect(withJosa('달의 각인')).toBe('달의 각인을');
  });

  it('빈 이름이어도 던지지 않는다', () => {
    expect(() => withJosa('')).not.toThrow();
  });

  it('어디에도 을(를) 이 남지 않는다 — 이게 제보의 내용이다', () => {
    for (const w of ['메스', '군용 붕대', 'TQQQ', '丙', '카드 1']) {
      expect(withJosa(w), w).not.toContain('(');
    }
  });
});
