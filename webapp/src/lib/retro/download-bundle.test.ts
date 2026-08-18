// 롬 내려받기 묶음 (#194) — 순수 부분.
//
// 조심할 것은 **이름 겹침**이다. 아케이드는 롬과 부모셋이 둘 다 zip 이고, 같은 이름으로
// 올라와 있을 수 있다(`ddsoma.zip` 을 본체로도 부모로도 쓴 문서가 실제로 있었다).
// zip 안에서 이름이 겹치면 나중 것이 앞의 것을 덮어써 **파일이 조용히 사라진다.**
import { describe, it, expect } from 'vitest';
import { bundleEntryNames, bundleFileName } from './download-bundle';

describe('bundleEntryNames', () => {
  it('롬만 있으면 하나', () => {
    expect(bundleEntryNames({ romName: 'game.sfc' })).toEqual(['game.sfc']);
  });

  it('패치가 있으면 함께 — 롬이 먼저', () => {
    expect(bundleEntryNames({ romName: 'game.sfc', patchName: '한글.ips' }))
      .toEqual(['game.sfc', '한글.ips']);
  });

  it('부모셋도 넣는다 — 아케이드는 이게 없으면 실행이 안 된다', () => {
    expect(bundleEntryNames({ romName: 'ddsomu.zip', parentNames: ['ddsom.zip'] }))
      .toEqual(['ddsomu.zip', 'ddsom.zip']);
  });

  // 여기가 핵심이다.
  it('이름이 겹치면 번호를 붙여 갈라 둔다 — 덮어쓰면 파일이 사라진다', () => {
    const names = bundleEntryNames({ romName: 'ddsoma.zip', parentNames: ['ddsoma.zip'] });
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toBe('ddsoma.zip');
    expect(names[1]).toMatch(/ddsoma.*\.zip/);
  });

  it('셋 이상 겹쳐도 모두 갈린다', () => {
    const names = bundleEntryNames({ romName: 'a.zip', parentNames: ['a.zip', 'a.zip'] });
    expect(new Set(names).size).toBe(3);
  });

  it('확장자 앞에 번호를 넣는다 — 확장자가 살아 있어야 열린다', () => {
    const [, second] = bundleEntryNames({ romName: 'x.zip', parentNames: ['x.zip'] });
    expect(second.endsWith('.zip')).toBe(true);
  });

  it('경로 구분자는 지운다 — zip 안에서 디렉터리를 만들지 않는다', () => {
    const [name] = bundleEntryNames({ romName: '../../etc/passwd' });
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
  });

  it('빈 이름은 그럴듯한 것으로 대체한다', () => {
    expect(bundleEntryNames({ romName: '' })[0].length).toBeGreaterThan(0);
  });
});

describe('bundleFileName', () => {
  it('제목에 zip 을 붙인다', () => {
    expect(bundleFileName('Tales of Phantasia')).toBe('Tales of Phantasia.zip');
  });

  it('한글 제목도 그대로', () => {
    expect(bundleFileName('슈퍼 마리오')).toBe('슈퍼 마리오.zip');
  });

  it('경로 구분자·제어문자를 지운다', () => {
    const n = bundleFileName('../a\\b\nc');
    expect(n).not.toMatch(/[/\\\n]/);
    expect(n.endsWith('.zip')).toBe(true);
  });

  it('제목이 비면 기본 이름', () => {
    expect(bundleFileName('')).toBe('rom.zip');
    expect(bundleFileName('   ')).toBe('rom.zip');
  });

  it('너무 길면 자른다 — 파일시스템 한계', () => {
    expect(bundleFileName('가'.repeat(300)).length).toBeLessThanOrEqual(104);
  });
});
