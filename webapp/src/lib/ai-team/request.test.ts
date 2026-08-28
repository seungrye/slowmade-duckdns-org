// 파이프라인 요청 파일 (#292).
//
// 클로드가 파이프라인을 직접 띄우면 20분~3시간짜리라 Bash 도구 타임아웃을 넘긴다. 그래서
// 백그라운드로 돌리고 "완료 알림을 기다리겠습니다" 하고 턴을 끝내는데, 그 순간 `claude -p`
// 가 종료되고 `Type=oneshot` cgroup 정리가 파이프라인을 SIGKILL 한다 — 매일 밤 그랬다.
//
// 그래서 클로드는 **요청만** 남기고 러너가 전경으로 돌린다. 이 파일은 그 요청을 읽는 규칙이다.
import { describe, it, expect } from 'vitest';
import { parseRequest, REQUEST_PATH } from '../../../../scripts/ai-team/request.mjs';

describe('REQUEST_PATH — 클로드 허용 목록과 맞아야 한다', () => {
  // `Bash(cat > /tmp/spec-*)` 가 이미 허용돼 있다. 그 밖의 경로를 쓰면 권한을 새로
  // 열어야 하고, 그러면 이 변경이 권한을 넓히는 셈이 된다.
  it('/tmp/spec- 으로 시작한다 — 새 권한이 안 늘어나게', () => {
    expect(REQUEST_PATH.startsWith('/tmp/spec-')).toBe(true);
  });
});

describe('parseRequest — 무엇을 요청으로 받아들이나', () => {
  it('spec 하나면 요청이 된다', () => {
    expect(parseRequest('spec=/tmp/spec-x.md')).toEqual({ spec: '/tmp/spec-x.md', post: null });
  });

  it('post 도 함께 읽는다', () => {
    expect(parseRequest('spec=/tmp/spec-x.md\npost=6a8bf1c452e0ccc4611ca2ae'))
      .toEqual({ spec: '/tmp/spec-x.md', post: '6a8bf1c452e0ccc4611ca2ae' });
  });

  it('줄 순서는 상관없다', () => {
    expect(parseRequest('post=6a8bf1c452e0ccc4611ca2ae\nspec=/tmp/spec-x.md')?.spec)
      .toBe('/tmp/spec-x.md');
  });

  it('빈 줄·주석·모르는 키는 건너뛴다', () => {
    const text = '# 메모\n\nspec=/tmp/spec-x.md\n엉뚱한키=값\n';
    expect(parseRequest(text)).toEqual({ spec: '/tmp/spec-x.md', post: null });
  });

  it('앞뒤 공백을 턴다 — 개행이 붙으면 경로를 못 찾는다', () => {
    expect(parseRequest('  spec =  /tmp/spec-x.md  \n')?.spec).toBe('/tmp/spec-x.md');
  });

  it('값에 = 가 있어도 첫 = 로만 가른다', () => {
    expect(parseRequest('spec=/tmp/spec-a=b.md')?.spec).toBe('/tmp/spec-a=b.md');
  });
});

describe('parseRequest — 요청으로 안 보는 것', () => {
  it('spec 이 없으면 null', () => {
    expect(parseRequest('post=6a8bf1c452e0ccc4611ca2ae')).toBeNull();
    expect(parseRequest('')).toBeNull();
    expect(parseRequest('# 주석뿐')).toBeNull();
  });

  it('spec 값이 비면 null', () => {
    expect(parseRequest('spec=')).toBeNull();
    expect(parseRequest('spec=   ')).toBeNull();
  });

  // 여기가 이 파서의 요점이다. 클로드가 쓰는 파일이므로 경로를 그대로 믿으면
  // 저장소 파일을 스펙이라며 넘길 수 있다.
  it('/tmp/spec- 밖의 경로는 거절한다', () => {
    expect(parseRequest('spec=/home/seungrye/site/README.md')).toBeNull();
    expect(parseRequest('spec=/tmp/other.md')).toBeNull();
    expect(parseRequest('spec=/etc/passwd')).toBeNull();
  });

  it('상대경로·상위 이동은 거절한다', () => {
    expect(parseRequest('spec=spec-x.md')).toBeNull();
    expect(parseRequest('spec=/tmp/spec-../../etc/passwd')).toBeNull();
  });

  it('post 가 24자리 16진수가 아니면 요청째로 거절한다 — 엉뚱한 스레드에 쓰지 않게', () => {
    expect(parseRequest('spec=/tmp/spec-x.md\npost=abc')).toBeNull();
    expect(parseRequest('spec=/tmp/spec-x.md\npost=zzzzzzzzzzzzzzzzzzzzzzzz')).toBeNull();
    expect(parseRequest('spec=/tmp/spec-x.md\npost=6a8bf1c452e0ccc4611ca2ae0')).toBeNull();
  });

  it('post 가 빈 값이면 없는 것으로 본다', () => {
    expect(parseRequest('spec=/tmp/spec-x.md\npost=')).toEqual({ spec: '/tmp/spec-x.md', post: null });
  });

  it('문자열이 아니면 null', () => {
    // @ts-expect-error 런타임 방어를 시험한다 — 파일을 읽어 넘기므로 타입이 보장되지 않는다
    expect(parseRequest(null)).toBeNull();
    // @ts-expect-error 위와 같은 이유
    expect(parseRequest(undefined)).toBeNull();
  });
});
