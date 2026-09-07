// Retro game volume control (#209).
//
// Moving the slider changed nothing. The UI was fine - the value changed and was saved.
// Measuring in a real browser with Playwright found the cause (identical on mGBA and snes9x):
//
//   OpenAL contexts  0        <- what EmulatorJS tries to control
//   AudioContext     1, running
//   gain nodes       0        <- there is nowhere at all to turn the sound down
//   972 connections, all AudioBufferSourceNode -> AudioDestinationNode
//
// RetroArch's Web Audio driver plugs its buffers straight into the destination. EmulatorJS's setVolume only walks
// `Module.AL.currentCtx.sources`, so it quietly short-circuits.
//
// So we insert the gain node ourselves. This file verifies only the insertion rules - whether real audio comes out
// cannot be seen from a unit test and was confirmed by measuring with Playwright.
import { describe, it, expect, afterEach } from 'vitest';
import {
  routeThroughGain,
  shouldLiftToFull,
} from '../../../public/games/retro/volume.js';

/** A minimal model of the browser's audio graph. It even mimics GainNode inheriting AudioNode. */
class FakeNode {
  context: FakeCtx;
  connections: unknown[] = [];
  constructor(ctx: FakeCtx) { this.context = ctx; }
  connect(dest: unknown) { this.connections.push(dest); return dest; }
}

/** A node with a gain stage has `.gain` - that is what our rule distinguishes on. */
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
    // the source went to the gain, not the destination...
    expect(src.connections[0]).toBe(ctx.created[0]);
    // ...and the gain holds the destination.
    expect(ctx.created[0].connections[0]).toBe(ctx.destination);
  });

  it('destination 이 아닌 연결은 건드리지 않는다', () => {
    const ctx = new FakeCtx();
    install();

    const src = new FakeNode(ctx);
    const other = new FakeNode(ctx);
    src.connect(other);

    expect(src.connections[0]).toBe(other);
    expect(ctx.created).toHaveLength(0); // not created needlessly
  });

  it('게인은 컨텍스트당 하나만 만든다', () => {
    const ctx = new FakeCtx();
    const route = install();

    // The core connects hundreds of times a second - creating one each time would blow up the graph.
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

  // If loadSettings runs before us, the value is set before the gain exists.
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

  // Remote netplay audio has its own gain stage that netplay.setVolume lowers separately.
  // Routing it through our gain as well would halve it twice (0.5 -> 0.25).
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
    expect(ctx.created).toHaveLength(1); // none created
  });
});

describe('shouldLiftToFull', () => {
  // EmulatorJS's default volume is 0.5, but until now that value had no effect and games played at 100%.
  // Halving the sound the moment it is fixed reads as a bug, so it is raised once, on first run.
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
