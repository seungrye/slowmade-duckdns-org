// The ROM download bundle (#194) - the pure part.
//
// What to watch for is **name collisions**. On arcade, the ROM and the parent set are both zips and can be uploaded
// under the same name (a document really did use `ddsoma.zip` as both the main ROM and the parent).
// Colliding names inside a zip mean the later one overwrites the earlier, and **a file silently disappears.**
import { describe, it, expect } from 'vitest';
import { bundleEntryNames, bundleFileName } from './download-bundle';

describe('bundleEntryNames', () => {
  it('롬만 있으면 하나', () => {
    expect(bundleEntryNames({ romName: 'game.sfc' })).toEqual(['game.sfc']);
  });

  // Keeping the patch's original name makes it hard to tell which file is the patch. D&D's patch really was named
  // `ddsomu.zip`, exactly like the ROM, so collision handling produced `ddsomu (2).zip` - and whoever downloaded it
  // could not tell which was the patch. It is pinned to **the ROM's name plus `-patch`** (#198).
  it('패치는 롬 이름에 -patch 를 붙여 넣는다', () => {
    expect(bundleEntryNames({ romName: 'game.sfc', patchName: '한글.ips' }))
      .toEqual(['game.sfc', 'game-patch.ips']);
  });

  it('패치 확장자는 살린다 — 형식이 보여야 한다', () => {
    expect(bundleEntryNames({ romName: 'a.sfc', patchName: 'x.bps' })[1]).toBe('a-patch.bps');
    expect(bundleEntryNames({ romName: 'a.sfc', patchName: 'x.zip' })[1]).toBe('a-patch.zip');
  });

  it('실제 사례 — 롬과 패치 이름이 같아도 한눈에 갈린다', () => {
    expect(bundleEntryNames({ romName: 'ddsomu.zip', patchName: 'ddsomu.zip' }))
      .toEqual(['ddsomu.zip', 'ddsomu-patch.zip']);
  });

  it('패치에 확장자가 없으면 그냥 -patch', () => {
    expect(bundleEntryNames({ romName: 'a.sfc', patchName: 'noext' })[1]).toBe('a-patch');
  });

  it('부모셋도 넣는다 — 아케이드는 이게 없으면 실행이 안 된다', () => {
    expect(bundleEntryNames({ romName: 'ddsomu.zip', parentNames: ['ddsom.zip'] }))
      .toEqual(['ddsomu.zip', 'ddsom.zip']);
  });

  // This is the heart of it.
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
