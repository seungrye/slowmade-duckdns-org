// 레트로 게임 음량 조절 (#209).
//
// 슬라이더를 움직여도 소리가 안 변했다. UI 는 멀쩡했다 — 값도 바뀌고 저장도 됐다.
// Playwright 로 실제 브라우저에서 재 보니 원인이 나왔다(mGBA·snes9x 동일):
//
//   OpenAL 컨텍스트  0개      ← EmulatorJS 가 조절하려는 대상
//   AudioContext     1개 running
//   gain 노드        0개      ← 소리를 줄일 지점이 아예 없다
//   연결 972건       전부 AudioBufferSourceNode → AudioDestinationNode
//
// RetroArch 의 Web Audio 드라이버가 버퍼를 destination 에 직접 꽂는다. EmulatorJS 의
// setVolume 은 `Module.AL.currentCtx.sources` 만 훑으므로 조용히 단락된다.
//
// 그래서 게인 노드를 우리가 끼워 넣는다. 이 파일은 그 끼워 넣기 규칙만 검증한다 —
// 진짜 오디오가 나는지는 단위 테스트로 못 보고, Playwright 실측으로 확인했다.
import { describe, it, expect, afterEach } from 'vitest';
import {
  routeThroughGain,
  shouldLiftToFull,
} from '../../../public/games/retro/volume.js';

/** 브라우저 오디오 그래프의 최소 모형. GainNode 가 AudioNode 를 상속하는 관계까지 흉내낸다. */
class FakeNode {
  context: FakeCtx;
  connections: unknown[] = [];
  constructor(ctx: FakeCtx) { this.context = ctx; }
  connect(dest: unknown) { this.connections.push(dest); return dest; }
}

/** 게인 단이 있는 노드는 `.gain` 을 가진다 — 우리 규칙이 이걸로 구분한다. */
class FakeGain extends FakeNode {
  gain = { value: 1 };
}

class FakeCtx {
  destination: FakeNode;
  created: FakeGain[] = [];
  constructor() { this.destination = new FakeNode(this); }
  createGain() { const g = new FakeGain(this); this.created.push(g); return g; }
}

let active: { restore(): void } | null = null;
function install() {
  active = routeThroughGain({ audioNodeProto: FakeNode.prototype });
  return active as ReturnType<typeof routeThroughGain>;
}
afterEach(() => { active?.restore(); active = null; });

describe('routeThroughGain', () => {
  it('destination 으로 가는 연결을 게인 노드를 거치게 돌린다', () => {
    const ctx = new FakeCtx();
    install();

    const src = new FakeNode(ctx);
    src.connect(ctx.destination);

    expect(ctx.created).toHaveLength(1);
    // 소스는 destination 이 아니라 게인으로 갔다…
    expect(src.connections[0]).toBe(ctx.created[0]);
    // …그리고 게인이 destination 을 물고 있다.
    expect(ctx.created[0].connections[0]).toBe(ctx.destination);
  });

  it('destination 이 아닌 연결은 건드리지 않는다', () => {
    const ctx = new FakeCtx();
    install();

    const src = new FakeNode(ctx);
    const other = new FakeNode(ctx);
    src.connect(other);

    expect(src.connections[0]).toBe(other);
    expect(ctx.created).toHaveLength(0); // 쓸데없이 만들지 않는다
  });

  it('게인은 컨텍스트당 하나만 만든다', () => {
    const ctx = new FakeCtx();
    const route = install();

    // 코어는 초당 수백 번 연결한다 — 매번 만들면 그래프가 터진다.
    for (let i = 0; i < 50; i++) new FakeNode(ctx).connect(ctx.destination);

    expect(ctx.created).toHaveLength(1);
    expect(route.gainCount()).toBe(1);
  });

  it('컨텍스트가 둘이면 게인도 둘 — 서로 섞이지 않는다', () => {
    const a = new FakeCtx();
    const b = new FakeCtx();
    const route = install();

    new FakeNode(a).connect(a.destination);
    new FakeNode(b).connect(b.destination);

    expect(a.created).toHaveLength(1);
    expect(b.created).toHaveLength(1);
    expect(route.gainCount()).toBe(2);
  });

  it('setGain 이 이미 만든 게인에 반영된다', () => {
    const ctx = new FakeCtx();
    const route = install();
    new FakeNode(ctx).connect(ctx.destination);

    route.setGain(0.25);

    expect(ctx.created[0].gain.value).toBe(0.25);
  });

  // loadSettings 가 우리보다 먼저 지나가면 게인이 생기기 전에 값이 정해진다.
  it('setGain 을 먼저 불러도 이후에 만들어지는 게인에 반영된다', () => {
    const ctx = new FakeCtx();
    const route = install();

    route.setGain(0.4);
    new FakeNode(ctx).connect(ctx.destination);

    expect(ctx.created[0].gain.value).toBe(0.4);
  });

  it('음소거(0)도 그대로 반영된다', () => {
    const ctx = new FakeCtx();
    const route = install();
    new FakeNode(ctx).connect(ctx.destination);

    route.setGain(0);

    expect(ctx.created[0].gain.value).toBe(0);
  });

  // 넷플레이 원격 소리는 자체 게인 단이 있고 netplay.setVolume 이 따로 줄인다.
  // 우리 게인까지 태우면 두 번 줄어든다(0.5 → 0.25).
  it('`.gain` 을 이미 가진 노드는 가로채지 않는다 — 이중 감쇄 방지', () => {
    const ctx = new FakeCtx();
    install();

    const theirGain = new FakeGain(ctx);
    theirGain.connect(ctx.destination);

    expect(theirGain.connections[0]).toBe(ctx.destination);
    expect(ctx.created).toHaveLength(0);
  });

  it('restore() 하면 원래 connect 로 돌아간다', () => {
    const ctx = new FakeCtx();
    const route = install();
    new FakeNode(ctx).connect(ctx.destination);
    expect(ctx.created).toHaveLength(1);

    route.restore();
    active = null;

    const after = new FakeNode(ctx);
    after.connect(ctx.destination);
    expect(after.connections[0]).toBe(ctx.destination);
    expect(ctx.created).toHaveLength(1); // 더 만들지 않았다
  });
});

describe('shouldLiftToFull', () => {
  // EmulatorJS 기본 음량은 0.5 인데 지금까지 그 값이 무효라 게임이 100% 로 울렸다.
  // 고치는 순간 소리가 절반이 되면 사용자에겐 고장으로 보인다 — 첫 실행 때 한 번만 올린다.
  it('마커가 없으면 올린다', () => {
    expect(shouldLiftToFull(null)).toBe(true);
    expect(shouldLiftToFull(undefined)).toBe(true);
    expect(shouldLiftToFull('')).toBe(true);
  });

  it('마커가 있으면 사용자가 고른 값을 존중한다', () => {
    expect(shouldLiftToFull('1')).toBe(false);
    expect(shouldLiftToFull('done')).toBe(false);
  });
});
