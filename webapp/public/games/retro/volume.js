// 레트로 게임 음량 조절 (#209).
//
// 슬라이더를 움직여도 소리가 안 변했다. UI 는 멀쩡했다 — 값도 바뀌고 저장도 됐다.
// Playwright 로 실제 브라우저에서 재 보니 원인이 나왔다(mGBA·snes9x 동일):
//
//   OpenAL 컨텍스트  0개          ← EmulatorJS 가 조절하려는 대상
//   AudioContext     1개 running  ← 소리는 여기서 난다
//   gain 노드        0개          ← **줄일 지점이 아예 없다**
//   연결 972건       전부 AudioBufferSourceNode → AudioDestinationNode
//
// RetroArch 의 Web Audio 드라이버가 작은 버퍼를 destination 에 **직접** 꽂는다. 그런데
// EmulatorJS 4.2.3 의 setVolume 은 `Module.AL.currentCtx.sources` 만 훑는다 —
// `currentCtx` 가 null 이라 그 체인은 조용히 단락되고 아무 일도 안 일어난다.
//
// 그래서 게인 노드를 **우리가** 끼워 넣는다. EmulatorJS 번들은 건드리지 않는다 —
// `scripts/games/fetch-emulatorjs.sh` 로 받는 gitignore 대상이라 다음 갱신에 날아간다.
//
// 이 모듈은 브라우저 전역을 직접 만지지 않고 **주입받는다**(테스트를 위해).

/**
 * destination 으로 가는 연결을 우리 게인 노드를 거치게 돌린다.
 *
 * @param {object} opts
 * @param {{connect: Function}} opts.audioNodeProto 감쌀 대상 — 보통 `AudioNode.prototype`.
 * @returns {{setGain: (v: number) => void, gainCount: () => number, restore: () => void}}
 */
export function routeThroughGain({ audioNodeProto }) {
  const original = audioNodeProto.connect;
  /** @type {Map<object, {gain: {value: number}}>} 컨텍스트 하나당 게인 하나. */
  const gains = new Map();
  // setGain 이 게인보다 먼저 불릴 수 있다(loadSettings 가 우리보다 앞설 때).
  let level = 1;

  function gainFor(ctx) {
    let g = gains.get(ctx);
    if (!g) {
      g = ctx.createGain();
      g.gain.value = level;
      // 우리 래퍼를 다시 타지 않게 **원본**으로 잇는다.
      original.call(g, ctx.destination);
      gains.set(ctx, g);
    }
    return g;
  }

  audioNodeProto.connect = function (dest, ...rest) {
    const ctx = dest && dest.context;
    // 가로채는 조건 둘:
    //   ① destination 으로 **직행**하는 연결일 것 (중간 노드끼리의 연결은 남의 일이다)
    //   ② 자체 게인 단이 없는 노드일 것 — 넷플레이 원격 소리는 제 게인을 갖고 있고
    //      `netplay.setVolume` 이 따로 줄인다. 우리까지 태우면 두 번 줄어든다(0.5 → 0.25).
    //      덤으로 우리 게인 노드가 자기 자신을 가로채는 재귀도 여기서 막힌다.
    if (ctx && dest === ctx.destination && this.gain === undefined) {
      return original.call(this, gainFor(ctx), ...rest);
    }
    return original.call(this, dest, ...rest);
  };

  return {
    setGain(v) {
      level = v;
      for (const g of gains.values()) g.gain.value = v;
    },
    gainCount: () => gains.size,
    restore() {
      audioNodeProto.connect = original;
    },
  };
}

/**
 * 이번이 음량을 한 번 최대로 올려 줄 첫 실행인가.
 *
 * EmulatorJS 의 기본 음량은 0.5 인데, 지금까지 그 값이 아무 효과가 없어 게임이 100% 로
 * 울렸다. 고치는 순간 소리가 절반이 되면 사용자에게는 고친 게 아니라 **고장 난 것**으로
 * 보인다. 그래서 딱 한 번 최대로 올려 표시와 소리를 맞추고, 그 뒤로는 사용자가 고른 값을
 * 그대로 둔다.
 *
 * @param {string|null|undefined} marker 저장해 둔 표시. 없으면 아직 안 올렸다는 뜻.
 */
export function shouldLiftToFull(marker) {
  return !marker;
}
