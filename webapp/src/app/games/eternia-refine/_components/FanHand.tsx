'use client';

// 부채꼴 손패 (#419 → #427).
//
// 세로 화면에 카드를 넣는 방법. 가로 스크롤 스트립으로 두면 **드래그가 스크롤과 싸운다**
// — 카드를 위로 끌어 내려는 손짓이 목록을 옆으로 밀어 버린다. 겹쳐 놓으면 스크롤이
// 사라지고 그 충돌도 함께 사라진다.
//
// 조작:
//   1. 누른다        — 그 카드가 올라오고 본문이 보인다
//   2. 좌우로 쓴다   — 손가락 밑 카드가 차례로 올라오고, 이웃은 옆으로 비켜난다
//   3. 위로 끈다     — DRAG_THRESHOLD 를 넘으면 낼 준비가 된다
//   4. 도로 내린다   — 제자리로
//
// ── 배치 모델: Godot 팬 레이아웃 이식 ────────────────────────────────
//
// stormtoy/card_fan_demo (Slay the Spire 식) 의 모델을 옮겼다:
//   정규화 위치  t = 2i/(n−1) − 1  ∈ [−1, 1]
//   회전         rot = t × rotation
//   포물선 호    y   = −arc × (1 − t²)      (가운데가 가장 높다)
//   호버         들리고 커진다 + 이웃은 좌우로 비켜난다
//
// **크기는 이식하지 않고 실측 폭에서 역산한다.** 원본의 스케일 1.5·흩어짐 120px 을
// 412px 화면에 그대로 넣으면 부채가 잘린다(실제로 한 번 겪었다). 구조는 그대로 두고
// 각도·간격·흩어짐만 컨테이너 폭에 맞춘다 — `fanGeometry` 가 그 계산이다.
//
// 이전 모델과의 차이: 회전 피벗이 카드 **아래 150px** 에 있었다. 그러면 회전이 카드를
// 옆으로도 밀어내(`PIVOT_BELOW × sinθ`) 폭을 크게 먹고, 아래로도 끌어내려 버튼을 덮었다.
// 지금은 피벗이 카드 중심이고 호를 y 로 직접 준다 — 같은 각도에서 폭이 훨씬 덜 든다.
//
// ── 훑을 때 전환을 줄이는 이유 (실측) ────────────────────────────────
//
// 전환이 200ms 인데 손가락은 60ms 마다 다음 카드로 넘어간다. 그래서 어떤 카드도 끝까지
// 못 올라오고 −20~−32 에서 되돌아 내려갔다(목표 −56). 손을 떼야 비로소 한 장이 섰다.
// 그래서 훑는 동안에는 전환을 **끈다**(SCRUB_MS = 0) — 위치를 손가락에서 바로 계산하니
// 따라올 것이 없다. 되돌아갈 때만 REST_MS 로 부드럽게 내린다.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Card } from '@/lib/eternia-refine/types';

/** 위로 이만큼 끌면 낸다. 짧으면 오발이 나고 길면 답답하다. */
const DRAG_THRESHOLD = -84;

/**
 * 튕기기(플릭) 판정 — 위로 이보다 빠르면 거리가 짧아도 낸다 (px/ms).
 *
 * 엄지로 톡 튕기는 손짓은 이동 거리가 짧다. 거리만 보면 그게 안 먹혀서
 * "왜 안 나가지" 가 된다. 속도를 같이 본다.
 */
const FLICK_VELOCITY = -0.55;

/** 플릭이라도 최소 이만큼은 올라가야 한다 — 손 떨림을 제출로 오인하지 않게. */
const FLICK_MIN_DY = -18;

/** 속도를 재는 창. 손을 떼기 직전 이 시간만큼의 움직임만 본다. */
const FLICK_WINDOW_MS = 80;

/** 이만큼 위로 끌기 전까지는 좌우 훑기로 본다. */
const SCRUB_UNTIL = -18;

// 시험이 같은 값을 다시 적지 않도록 내보낸다 — 어긋나면 시험이 거짓으로 통과한다.
export const CARD_W = 100;
export const CARD_H = 144;
export const EDGE_PAD = 10;

/** 가장 바깥 카드가 눕는 각도. 눕힐수록 예쁘지만 이름이 안 읽히고 폭을 먹는다. */
export const MAX_ROTATION_DEG = 12;

/** 가운데 카드가 가장자리보다 이만큼 높다 — 손에 쥔 부채의 호. */
const ARC_HEIGHT = 18;

/**
 * 겹침 정도 — 이보다 넓게는 안 벌린다. 작을수록 많이 겹친다.
 *
 * **40 이었는데 그것이 넓은 화면의 병목이었다** (#443). 카드 폭이 100 이라 40 이면 이웃이
 * 60% 를 가려 이름이 서너 자만 보였다 — 실측에서 「달의 각인」이 "달의 각", 「군용 봉인」이
 * "군용 봉(" 으로 보였다. 잘린 것이 아니라 **가려진** 것이라 글자 크기로는 못 고친다.
 *
 * 72 면 28px 만 겹친다. 여전히 부채로 읽히면서 이름이 드러난다. 좁은 화면은 이 값이 아니라
 * [fit] 의 폭 계산이 정하므로(412px·8장이면 32) **넓을 때만** 달라진다.
 */
const MAX_GAP = 72;

/** 이보다 좁아지면 더는 안 겹치고 각도를 줄인다. */
const MIN_GAP = 13;

/**
 * 고른 카드가 올라오는 높이 — 카드 높이의 절반.
 *
 * 예전엔 −56(38%)이라 "절반쯤 올라온다"에 못 미쳤다.
 */
export const HOVER_LIFT = -72;

/**
 * 고른 카드가 커지는 배율.
 *
 * 원본은 1.5 인데 그건 카드가 크고 화면이 넓은 데스크톱 기준이다. 100×144 카드를
 * 412px 폭에서 1.5배 하면 이웃을 통째로 덮어 무엇을 고르는지 안 보인다. 1.25 로 낮췄다.
 */
export const HOVER_SCALE = 1.25;

/** 이웃이 옆으로 비켜서는 거리. 남는 폭이 모자라면 `fanGeometry` 가 줄인다(0 까지). */
export const SCATTER_MAX = 20;

/**
 * 훑는 동안의 전환 — **없다.** 손가락 위치에서 바로 계산하므로 따라올 것이 없다.
 *
 * 60ms 로도 해 봤는데 한 카드에 머무는 60ms 안에 61%(−44/−72)까지밖에 못 올라왔다.
 * 리액트가 다시 그리는 시간이 그 안에 들어가기 때문이다. 전환이 남아 있는 한 빠르게
 * 훑을수록 덜 올라오고, 그게 처음의 어색함이었다.
 */
const SCRUB_MS = 0;

/** 손을 뗀 뒤 제자리로 돌아가는 전환. */
const REST_MS = 200;

const rad = (d: number) => (d * Math.PI) / 180;

export interface FanGeometry {
  /** 카드 사이 가로 간격(px). */
  gap: number;
  /** 가장 바깥 카드의 회전(도). */
  rotation: number;
  /** 가운데 카드가 가장자리보다 높은 정도(px). */
  arc: number;
  /** 이웃이 비켜서는 거리(px). 폭이 모자라면 0. */
  scatter: number;
  /** 회전 때문에 카드가 제 상자 아래로 내려가는 양(px). */
  drop: number;
  /** 손패 상자의 높이(px). */
  height: number;
  /** 카드 크기 배율 (#459). 좁은 화면에서만 1 아래로 내려간다. */
  scale: number;
}

/**
 * 컨테이너 폭에 맞는 부채를 구한다.
 *
 * 가장 바깥 카드의 가로 반폭 = 회전한 카드의 반폭 + 중심에서 밀려난 거리. 이것이
 * `폭/2 − 여백` 을 넘지 않게 **각도부터** 줄이고, 그래도 안 되면 간격을 줄인다.
 * 남는 폭이 있으면 그만큼을 이웃 흩어짐에 준다 — 흩어져도 화면을 안 넘게.
 *
 * ```
 * fanGeometry(412, 5)   -> gap 56, rotation 12, scatter 20
 * fanGeometry(360, 10)  -> 간격이 좁아지고 흩어짐이 0 에 가까워진다
 * ```
 */
/**
 * 카드가 이 비율보다 더 가려지면 이름이 안 읽힌다 — 부채가 아니라 더미로 보인다 (#459).
 *
 * 제보로 잡았다: 320px·5장에서 67%, 300px·6장에서 78% 가 가려졌다.
 */
const MIN_VISIBLE_RATIO = 0.45;

/** 카드를 이보다 더 줄이면 글자를 못 읽는다. */
const MIN_SCALE = 0.65;

export function fanGeometry(width: number, n: number): FanGeometry {
  if (n <= 1) {
    return { gap: 0, rotation: 0, arc: 0, scatter: 0, drop: 0, height: CARD_H, scale: 1 };
  }
  const budget = width / 2 - EDGE_PAD;
  const half = (n - 1) / 2;

  /**
   * **가려지는 비율을 목표로 두고 순서대로 양보한다** (#459).
   *
   * 예전에는 각도를 12° 부터 내리다가 간격이 `MIN_GAP` 만 넘으면 바로 멈췄다. 그래서 회전은
   * 어느 폭에서도 12° 로 남고 좁아질수록 **간격만** 깎였다 — 브라우저에서 재니 320px 에서
   * 카드의 **75%** 가 가려졌다(#460 재현). 회전은 폭을 크게 먹는데(12° 면 63.9px, 0° 면
   * 50px) 그 차이가 간격으로 갔어야 했다.
   *
   * 양보 순서는 **흩어짐 → 카드 크기 → 회전**이다.
   *
   * 처음엔 회전을 제일 먼저 내놨다(#459). 회전이 폭을 많이 먹으니(12° 면 63.9px, 0° 면
   * 50px) 싸다고 봤다. 그런데 **회전이야말로 부채를 부채로 만드는 것**이라, 먼저 버리니
   * 340px 이하에서 카드가 그냥 서 있고 계단처럼 보였다 — 부채로 보이게 하려던 일이 부채를
   * 없앴다(#467 제보: "이거는 그냥 세워둔거잖아").
   *
   * 그래서 회전은 끝까지 지키고 **카드를 줄여** 자리를 낸다. 288px·5장이면 12° 를 지키면서
   * 배율 0.74 가 된다 — 카드가 조금 작아지는 값을 치르고 부채를 지킨다.
   */
  for (const reserve of [SCATTER_MAX, 0]) {
    const s = maxScale(budget, half, MAX_ROTATION_DEG, reserve);
    if (s >= 1) return fit(budget, half, MAX_ROTATION_DEG, reserve, 1);
    if (s >= MIN_SCALE) return fit(budget, half, MAX_ROTATION_DEG, reserve, s);
  }

  // 가장 작은 카드로도 각도를 못 지키는 극단(아주 좁은데 장수까지 많다) — 그때야 눕힌 각도를
  // 줄인다. 흔한 손패(3~6장)에서는 여기까지 안 온다.
  for (let deg = MAX_ROTATION_DEG; deg >= 0; deg -= 0.5) {
    const s = maxScale(budget, half, deg, 0);
    if (s >= MIN_SCALE) return fit(budget, half, deg, 0, Math.min(1, s));
  }

  // 목표를 못 채우는 아주 좁은 화면 — 가장 작은 카드로 최대한 벌린다.
  return fit(budget, half, 0, 0, MIN_SCALE);
}

/** 회전한 카드의 가로 반폭 — 회전이 폭을 얼마나 먹는지. 12° 면 63.9px, 0° 면 50px. */
export function rotatedHalfWidth(deg: number): number {
  const rot = rad(deg);
  return (CARD_W * Math.cos(rot) + CARD_H * Math.sin(rot)) / 2;
}

/**
 * 목표(가려지는 비율)를 채우는 **가장 큰 배율**. 0.02 씩 훑지 않고 직접 푼다 — 훑으면 폭이
 * 조금 늘 때 한 칸 건너뛰며 결과가 아주 작게 뒤집힌다(단조성이 깨진다).
 *
 * ```
 * gap = room / half  >=  RATIO · CARD_W · s
 * room = min(budget − HW(deg)·s − reserve,  budget − (CARD_W·HOVER_SCALE/2)·s)
 * ```
 *
 * 두 갈래 각각을 s 에 대해 풀고 작은 쪽을 쓴다.
 */
function maxScale(budget: number, half: number, deg: number, reserve: number): number {
  const need = MIN_VISIBLE_RATIO * CARD_W * half;
  const selHalf = (CARD_W * HOVER_SCALE) / 2;
  const byRotation = (budget - reserve) / (need + rotatedHalfWidth(deg));
  const bySelected = budget / (need + selHalf);
  return Math.min(byRotation, bySelected);
}

/** 정해진 각도·배율로 간격을 최대한 벌린다. */
function fit(
  budget: number,
  half: number,
  deg: number,
  reserve: number,
  scale: number,
): FanGeometry {
  const room = Math.min(
    budget - rotatedHalfWidth(deg) * scale - reserve,
    budget - (CARD_W * scale * HOVER_SCALE) / 2,
  );
  const gap = Math.max(MIN_GAP * scale, Math.min(MAX_GAP * scale, room / half));
  return build(deg, gap, budget, half, reserve, scale);
}

function build(
  deg: number,
  gap: number,
  budget: number,
  half: number,
  reserve: number,
  scale: number,
): FanGeometry {
  const rot = rad(deg);
  const spanHalf = half * gap;
  const scatter = Math.max(0, Math.min(reserve, budget - spanHalf - rotatedHalfWidth(deg) * scale));
  // 중심 회전이라 카드가 아래로 내려가는 양은 예전(피벗이 카드 밖) 보다 훨씬 작다.
  const drop = Math.max(
    0,
    Math.ceil(((CARD_W * Math.sin(rot) + CARD_H * Math.cos(rot)) * scale - CARD_H * scale) / 2),
  );
  return {
    gap, rotation: deg, arc: ARC_HEIGHT, scatter, drop, scale,
    height: CARD_H * scale + drop + ARC_HEIGHT,
  };
}

/** 카드 i 의 정규화 위치 — 왼쪽 끝 −1, 가운데 0, 오른쪽 끝 +1. */
export function normalized(i: number, n: number): number {
  return n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
}

export interface FanHandProps {
  hand: Card[];
  /** 낼 수 없는 카드는 올라오되 나가지 않는다 — 결정을 손으로 겪게 하려고. */
  canPlay: (card: Card) => boolean;
  onPlay: (index: number) => void;
  disabled?: boolean;
}

export function FanHand({ hand, canPlay, onPlay, disabled }: FanHandProps) {
  const [sel, setSel] = useState(-1);
  const [dy, setDy] = useState(0);
  const [armed, setArmed] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [width, setWidth] = useState(360);
  const dragging = useRef(false);
  const startY = useRef(0);
  /**
   * 최근 움직임 표본 — 플릭 속도를 재려고 들고 있는다.
   *
   * 표본 하나(직전 이벤트)로 재면 두 이벤트의 시각이 같을 때 dt=0 이라 속도가 0 으로
   * 남는다. 실제로 그래서 튕겨도 안 나갔다. **창(window)으로** 재면 그 구멍이 없다.
   */
  const samples = useRef<{ y: number; t: number }[]>([]);
  const root = useRef<HTMLDivElement>(null);

  const n = hand.length;
  const { gap, rotation, arc, scatter, drop, height, scale: baseScale } = fanGeometry(width, n);

  // 폭이 바뀌면 부채를 다시 편다 — 회전으로 화면을 넘지 않게.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSel(-1);
    setDy(0);
    setArmed(false);
  }, [hand]);

  /**
   * 손가락 밑 카드 — **기하로** 계산한다.
   *
   * 예전엔 카드의 실제 위치를 재서 가장 가까운 것을 골랐는데, 이웃이 흩어지면 그 위치가
   * 움직여서 같은 x 에서 고르는 카드가 왔다 갔다 할 수 있다. 쉬는 자리로 계산하면 그
   * 되먹임이 없다.
   */
  const indexAt = useCallback(
    (clientX: number) => {
      const el = root.current;
      if (!el || n === 0) return -1;
      if (n === 1) return 0;
      const r = el.getBoundingClientRect();
      const rel = clientX - (r.left + r.width / 2);
      const i = Math.round(rel / gap + (n - 1) / 2);
      return Math.max(0, Math.min(n - 1, i));
    },
    [gap, n],
  );

  /** 표본을 쌓되 창 밖은 버린다. */
  const pushSample = (y: number) => {
    const t = performance.now();
    const xs = samples.current;
    xs.push({ y, t });
    while (xs.length > 2 && t - xs[0].t > FLICK_WINDOW_MS) xs.shift();
  };

  /** 창 안에서의 평균 속도(px/ms). 위로 갈수록 음수. */
  const velocity = () => {
    const xs = samples.current;
    if (xs.length < 2) return 0;
    const a = xs[0];
    const b = xs[xs.length - 1];
    const dt = b.t - a.t;
    return dt > 0 ? (b.y - a.y) / dt : 0;
  };

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    const i = indexAt(e.clientX);
    if (i < 0) return;
    dragging.current = true;
    startY.current = e.clientY;
    samples.current = [{ y: e.clientY, t: performance.now() }];
    setScrubbing(true);
    setSel(i);
    setDy(0);
    setArmed(false);
    root.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = e.clientY - startY.current;

    pushSample(e.clientY);

    // 위로 안 끌었으면 좌우 훑기 — 손가락 밑 카드로 갈아탄다.
    if (delta > SCRUB_UNTIL) {
      const i = indexAt(e.clientX);
      if (i >= 0 && i !== sel) {
        setSel(i);
        startY.current = e.clientY;
        setDy(0);
        setArmed(false);
        return;
      }
      setDy(Math.min(0, delta));
      setArmed(false);
      return;
    }
    setDy(delta);
    setArmed(delta < DRAG_THRESHOLD);
  };

  const up = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const i = sel;

    // 제출은 **두 길뿐**이다: 충분히 끌어 올렸거나, 위로 튕겼거나.
    // 탭은 펼치기이므로 여기서 제출로 새면 안 된다.
    const flicked = velocity() <= FLICK_VELOCITY && dy <= FLICK_MIN_DY;
    const shouldPlay = armed || flicked;

    setScrubbing(false);
    setDy(0);
    setArmed(false);
    if (shouldPlay && i >= 0 && hand[i] && canPlay(hand[i])) onPlay(i);
  };

  return (
    <div
      ref={root}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ height }}
      className="relative w-full shrink-0 touch-none select-none"
      aria-label="손패"
    >
      {armed && (
        <div className="pointer-events-none absolute inset-x-0 -top-10 z-[70] flex justify-center">
          <span className="rounded-md border-2 border-amber-700 bg-amber-100/95 px-4 py-2 text-sm font-bold text-amber-800">
            놓으면 낸다
          </span>
        </div>
      )}

      {hand.map((card, i) => {
        const t = normalized(i, n);
        const isSel = i === sel;
        const playable = canPlay(card);

        // 쉬는 자리 — 정규화 위치가 x·회전·호를 한꺼번에 정한다.
        let x = t * ((n - 1) / 2) * gap;
        let y = -arc * (1 - t * t);
        let deg = t * rotation;
        // 좁은 화면에서는 카드 자체가 줄어 있다 (#459). 고른 카드는 거기에 더 커진다.
        let scale = baseScale;

        if (isSel) {
          // 고른 카드는 똑바로 서서 올라온다. 끌고 있으면 손가락을 따라간다.
          y = dy || HOVER_LIFT;
          deg = 0;
          scale = baseScale * HOVER_SCALE;
        } else if (sel >= 0) {
          x += i < sel ? -scatter : scatter;
        }

        return (
          <button
            key={card.id}
            type="button"
            disabled={disabled}
            style={{
              width: CARD_W,
              height: CARD_H,
              marginLeft: -CARD_W / 2,
              bottom: drop,
              transform: `translate(${x}px, ${y}px) rotate(${deg}deg) scale(${scale})`,
              transitionDuration: `${scrubbing ? SCRUB_MS : REST_MS}ms`,
              zIndex: isSel ? 60 : i,
            }}
            onClick={(e) => {
              // 탭·클릭은 **펼치기**다 (사용자 지정). 제출은 위로 끌거나 튕길 때만.
              // 다만 키보드 활성화(detail === 0)는 손짓을 쓸 수 없으므로,
              // 펼쳐 둔 카드에서 한 번 더 누르면 제출로 받는다.
              //
              // 포인터로 누르면 이 핸들러는 **불리지 않는다** — pointerdown 이 컨테이너로
              // 포인터를 캡처해 click 이 재타겟되기 때문이다. 즉 아래 setSel 은 키보드
              // 전용 경로다(e2e 변형 실험으로 확인).
              if (dragging.current) return;
              const byKeyboard = e.detail === 0;
              if (byKeyboard && sel === i && playable) onPlay(i);
              else setSel(i);
            }}
            className={[
              'absolute left-1/2 flex flex-col gap-1 overflow-hidden rounded-md border p-2 text-left',
              'transition-transform ease-out motion-reduce:transition-none',
              isSel ? 'shadow-lg' : 'shadow-sm',
              card.kind === 'crystal'
                ? 'border-slate-300 bg-slate-100 text-slate-500'
                : card.kind === 'stigma'
                  ? 'border-amber-800 bg-amber-100'
                  : 'border-amber-300 bg-amber-50',
              !playable && card.kind !== 'crystal' ? 'opacity-60' : '',
            ].join(' ')}
          >
            <span className="flex justify-between font-mono text-[10px] font-semibold">
              <span className={card.kind === 'crystal' ? 'text-slate-400' : 'text-amber-700'}>
                {card.cost === null ? '—' : card.cost}
              </span>
              <span className="text-slate-500">{card.erosion > 0 ? `+${card.erosion}` : '—'}</span>
            </span>
            <span className="text-[12px] font-bold leading-tight">{card.name}</span>
            <span
              className={[
                'overflow-hidden text-[10px] leading-snug transition-opacity duration-150 motion-reduce:transition-none',
                isSel ? 'opacity-100' : 'opacity-0',
                card.kind === 'crystal' ? 'text-slate-500' : 'text-amber-900',
              ].join(' ')}
            >
              {card.text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
