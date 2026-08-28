// 씬 조회 통로의 순수 규칙 (#310).
//
// 클로드가 "공중도시 붕괴 씬이 뭐냐" 를 DB 를 못 읽어 사람에게 되묻고 있었다. 원시 접속을
// 주는 대신 `api.sh` 처럼 **할 수 있는 일을 못박은 래퍼**를 둔다. 판정만 여기서 시험한다.
import { describe, it, expect } from 'vitest';
import {
  parseCommand, escapeRegex, formatScenes, formatScene, formatSearch, MAX_BODY_CHARS,
} from '../../../../scripts/ai-team/db-query.mjs';

describe('parseCommand — 할 수 있는 일은 셋뿐', () => {
  it('scenes 는 인자가 없다', () => {
    expect(parseCommand(['scenes'])).toEqual({ cmd: 'scenes', arg: '' });
  });

  it('scene 은 id 를 받는다', () => {
    expect(parseCommand(['scene', 'sc-01'])).toEqual({ cmd: 'scene', arg: 'sc-01' });
  });

  it('search 는 여러 낱말을 한 문구로 잇는다', () => {
    expect(parseCommand(['search', '공중', '도시'])).toEqual({ cmd: 'search', arg: '공중 도시' });
  });

  it('모르는 명령은 null — 못박은 셋 밖으로 안 나간다', () => {
    for (const bad of [['drop'], ['find'], ['users'], ['posts'], ['scene;rm'], []]) {
      expect(parseCommand(bad)).toBeNull();
    }
  });

  it('인자가 필요한데 없으면 null', () => {
    expect(parseCommand(['scene'])).toBeNull();
    expect(parseCommand(['search'])).toBeNull();
    expect(parseCommand(['search', '   '])).toBeNull();
  });

  it('인자가 아닌 것이 오면 null', () => {
    // @ts-expect-error 셸에서 넘어오므로 타입이 보장되지 않는다
    expect(parseCommand(null)).toBeNull();
  });
});

describe('escapeRegex — 검색어를 그대로 정규식에 넣지 않는다', () => {
  it('특수문자를 막는다', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b');
    expect(escapeRegex('a*b')).toBe('a\\*b');
    expect(escapeRegex('(a)')).toBe('\\(a\\)');
    expect(escapeRegex('a|b')).toBe('a\\|b');
  });

  it('평범한 글자는 그대로', () => {
    expect(escapeRegex('공중도시')).toBe('공중도시');
  });

  // 이스케이프를 빼먹으면 이런 것이 정규식으로 해석돼 터지거나 전부를 훑는다.
  it('정규식으로 해석되면 위험한 것도 문자로 남는다', () => {
    const 판 = new RegExp(escapeRegex('(a+)+$'));
    expect(판.test('(a+)+$')).toBe(true);
    expect(판.test('aaaa')).toBe(false);
  });
});

describe('formatScenes — 목록에는 본문을 싣지 않는다', () => {
  const docs = [
    { id: 'sc-01', title: '폐기 처분 통보', body: ['긴 본문', '두 번째 줄'] },
    { id: 'sc-02', title: '공중도시', body: ['x'] },
  ];

  it('제목과 id 를 준다', () => {
    const s = formatScenes(docs);
    expect(s).toContain('sc-01');
    expect(s).toContain('폐기 처분 통보');
  });

  it('본문은 안 싣는다 — 135건이라 통째로 뱉으면 못 읽는다', () => {
    expect(formatScenes(docs)).not.toContain('두 번째 줄');
  });

  it('건수를 알려준다', () => {
    expect(formatScenes(docs)).toMatch(/2/);
  });

  it('비어도 터지지 않는다', () => {
    expect(() => formatScenes([])).not.toThrow();
    expect(formatScenes([])).toMatch(/없/);
  });
});

describe('formatScene — 하나는 본문까지', () => {
  it('제목과 본문 줄을 모두 준다', () => {
    const s = formatScene({ id: 'sc-01', title: '통보', body: ['첫 줄', '둘째 줄'] });
    expect(s).toContain('통보');
    expect(s).toContain('첫 줄');
    expect(s).toContain('둘째 줄');
  });

  it('본문이 길면 자른다', () => {
    const s = formatScene({ id: 'x', title: 't', body: ['가'.repeat(MAX_BODY_CHARS * 2)] });
    expect(s.length).toBeLessThan(MAX_BODY_CHARS * 2);
  });

  it('없으면 없다고 한다', () => {
    expect(formatScene(null)).toMatch(/없/);
  });

  it('body 가 배열이 아니어도 터지지 않는다', () => {
    expect(() => formatScene({ id: 'x', title: 't', body: '문자열' as never })).not.toThrow();
  });
});

describe('formatSearch — 어디에 걸렸는지 보여준다', () => {
  const docs = [{ id: 'sc-02', title: '공중도시 붕괴', body: ['하늘이 무너진다', '공중도시가 떨어졌다'] }];

  it('제목과 걸린 줄을 함께 준다', () => {
    const s = formatSearch(docs, '공중도시');
    expect(s).toContain('sc-02');
    expect(s).toContain('공중도시가 떨어졌다');
  });

  it('안 걸린 줄은 안 싣는다', () => {
    expect(formatSearch(docs, '공중도시')).not.toContain('하늘이 무너진다');
  });

  it('없으면 없다고 한다', () => {
    expect(formatSearch([], '없는말')).toMatch(/없/);
  });
});
