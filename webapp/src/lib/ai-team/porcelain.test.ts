// 새 디렉터리가 한 줄로 접히는 것.
//
// git 은 **통째로 추적되지 않는 디렉터리를 한 줄로 접는다** — 안에 파일이 몇 개든
// `?? webapp/src/lib/eternia-deck/` 한 줄이다. 그래서 클로드가 테스트를 새 디렉터리에 쓰면
// `changedPaths` 가 디렉터리 경로 하나만 돌려주고, `isTest` 가 거짓이 되고, 파이프라인이
// "테스트가 하나도 만들어지지 않았습니다" 로 끝난다.
//
// 어젯밤 00:40 실행이 정확히 그렇게 끝났다. 워크트리 `/tmp/ai-pipeline-1787931602742-6y8JFN`
// 에 `webapp/src/lib/eternia-deck/` 가 통째로 untracked 로 남아 있고 그 안에
// `combat.test.ts` 를 포함해 파일 다섯이 실제로 있다. **테스트는 만들어졌는데 파이프라인이
// 못 본 것이다.**
//
// #319 로 그 자리가 die() 에서 salvage() 로 바뀌었지만 이 버그는 그대로다. 흔적은 남되
// 판정이 `NO_TESTS` 로 찍히고, 그 풀이가 "스펙을 좁혀 다시 요청하세요" 로 나간다. 스펙은
// 멀쩡했다 — 못 고치는 정도가 아니라 **엉뚱한 데를 파게 만드는 오진**이다.
import { describe, it, expect } from 'vitest';
import {
  STATUS_ARGS, parsePorcelain, directoryEntries,
} from '../../../../scripts/ai-team/snapshot.mjs';
import { StuckKind, stuckIssueBody, stuckComment } from '../../../../scripts/ai-team/rescue.mjs';

describe('parsePorcelain — porcelain 한 덩이를 항목으로', () => {
  it('빈 입력이면 빈 목록 — 줄바꿈만 있어도 같다', () => {
    expect(parsePorcelain('')).toEqual([]);
    expect(parsePorcelain('\n')).toEqual([]);
    expect(parsePorcelain('\n\n\n')).toEqual([]);
  });

  it('신규는 status 와 경로로 갈린다', () => {
    expect(parsePorcelain('?? a.ts')).toEqual([{ status: '??', path: 'a.ts' }]);
  });

  // 수정은 앞 칸이 비어 있다(` M`). 양끝 공백을 안 떼면 status 가 ' M' 이 된다.
  it('수정은 앞 칸이 비어 있어도 status 를 제대로 뗀다', () => {
    expect(parsePorcelain(' M webapp/src/x.ts')).toEqual([
      { status: 'M', path: 'webapp/src/x.ts' },
    ]);
  });

  // 화살표 앞은 이미 없는 파일이다. 그걸 취하면 다음 단계가 없는 파일을 읽는다.
  it('rename 은 화살표 뒤(지금 존재하는 이름)를 취한다', () => {
    expect(parsePorcelain('R  옛.ts -> 새.ts')).toEqual([{ status: 'R', path: '새.ts' }]);
  });

  it('줄 사이에 빈 줄이 섞여도 그 줄만 버린다', () => {
    expect(parsePorcelain('?? a.ts\n\n M b.ts\n')).toEqual([
      { status: '??', path: 'a.ts' },
      { status: 'M', path: 'b.ts' },
    ]);
  });

  // 이 단계는 거르지 않는다 — 디렉터리 판단은 directoryEntries 한 곳에만 둔다.
  it('접힌 디렉터리도 온 그대로 낸다 — 슬래시를 떼지 않는다', () => {
    expect(parsePorcelain('?? webapp/src/lib/eternia-deck/')).toEqual([
      { status: '??', path: 'webapp/src/lib/eternia-deck/' },
    ]);
  });

  it('경로 안의 공백은 그대로 둔다 — 뒤쪽 공백만 뗀다', () => {
    expect(parsePorcelain('?? webapp/src/a b.ts  ')).toEqual([
      { status: '??', path: 'webapp/src/a b.ts' },
    ]);
  });
});

describe('directoryEntries — git 이 접어 버린 것', () => {
  const 항목 = (path: string, status = '??') => ({ status, path });

  it('빈 목록이면 빈 목록', () => {
    expect(directoryEntries([])).toEqual([]);
  });

  it('슬래시로 끝나는 것만 잡는다', () => {
    const got = directoryEntries([항목('webapp/src/lib/eternia-deck/'), 항목('a.ts')]);
    expect(got).toEqual([항목('webapp/src/lib/eternia-deck/')]);
  });

  it('접힌 것이 여럿이면 온 순서 그대로 전부 낸다', () => {
    const got = directoryEntries([항목('b/'), 항목('a.ts'), 항목('a/')]);
    expect(got.map((e) => e.path)).toEqual(['b/', 'a/']);
  });

  // 끝만 본다. 가운데 슬래시로 잡으면 멀쩡한 파일이 전부 "접힌 디렉터리" 가 된다.
  it('슬래시가 가운데 있는 것은 안 잡는다', () => {
    expect(directoryEntries([항목('webapp/src/lib/a.test.ts')])).toEqual([]);
  });
});

describe('STATUS_ARGS — 접힘을 푸는 인자', () => {
  // 이 플래그가 실제 고침이다. 없으면 git 이 새 디렉터리를 한 줄로 접고 버그가 그대로다.
  it('--untracked-files=all 이 들어 있다', () => {
    expect(STATUS_ARGS).toContain('--untracked-files=all');
    expect(STATUS_ARGS).toContain('--porcelain');
  });
});

// 그래도 접힌 것이 보이면 판정을 갈라 적는다.
//
// `-uall` 을 줬는데도 디렉터리 항목이 오면(git 판올림·설정 차이) 지금처럼 뭉뚱그리면 안
// 된다. 여기서 갈라지는 것이 사람이 무엇을 고치느냐다 — `NO_TESTS` 는 스펙을 좁히라고
// 하고, `COLLAPSED_DIR` 은 스펙이 아니라 파이프라인이 못 본 것이라고 해야 한다.
describe('COLLAPSED_DIR 판정 — 스펙 탓으로 돌리지 않는다', () => {
  const 접힘 = {
    kind: StuckKind.GATE_FAILED,
    gate: '테스트 작성',
    verdict: 'COLLAPSED_DIR',
    spec: '# 전투 판정',
    branch: 'pipeline/1787',
    testFiles: [],
    output: '?? webapp/src/lib/eternia-deck/',
  };

  it('이슈 본문에 디렉터리가 접혔다는 풀이가 붙는다', () => {
    const b = stuckIssueBody(접힘);
    expect(b).toContain('COLLAPSED_DIR');
    expect(b).toMatch(/디렉터리/);
    expect(b).toMatch(/접|한 줄/);
  });

  // 이 둘을 나란히 재는 것이 요점이다. 같은 문구가 나오면 갈라 둔 의미가 없다.
  it('NO_TESTS 와 갈라진다 — 접힘에는 "스펙을 좁혀" 가 없다', () => {
    const 없음 = stuckIssueBody({ ...접힘, verdict: 'NO_TESTS' });
    const 접힌쪽 = stuckIssueBody(접힘);
    expect(없음).toContain('스펙을 좁혀');
    expect(접힌쪽).not.toContain('스펙을 좁혀');
    expect(접힌쪽).toMatch(/디렉터리/);
  });

  it('덧글도 같은 풀이를 싣는다 — 사람이 아침에 보는 것은 이쪽이다', () => {
    const c = stuckComment(접힘);
    expect(c).toContain('COLLAPSED_DIR');
    expect(c).toMatch(/디렉터리/);
    expect(c).not.toContain('스펙을 좁혀');
  });
});
