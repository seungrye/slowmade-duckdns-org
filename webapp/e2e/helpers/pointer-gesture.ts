// 포인터 제스처 — 끌기·튕기기를 **페이지 안에서** 낸다 (#419).
//
// ── 왜 Playwright 의 mouse API 를 안 쓰나 ────────────────────────────
//
// `page.mouse.move()` 를 여러 번 부르면 호출마다 CPU↔브라우저 왕복이 생겨, 40px 를
// 다섯 번에 나눠 옮기는 데 실제로 200ms 넘게 걸린다. 그러면 속도가 0.2px/ms 밖에 안 나와
// **플릭으로 판정되지 않는다.** 반대로 `waitForTimeout` 없이 몰아 부르면 이번엔 이벤트
// 시각이 전부 같아져 dt=0 이 된다. 어느 쪽으로도 진짜 손짓의 시간 규모가 안 나온다.
//
// 실제로 이것 때문에 멀쩡한 구현을 한참 의심했다. 그래서 이벤트를 페이지 안에서
// `setTimeout` 간격으로 직접 낸다 — 40px 를 34ms 에 옮기는 손짓을 그대로 만든다.
//
// ── 쓰는 법 ─────────────────────────────────────────────────────────
//
//   await dragUp(page, '[aria-label="손패"]', { atX: cx, atY: cy, distance: 40, durationMs: 34 });
//
// `atX`/`atY` 는 눌러야 할 지점의 뷰포트 좌표다. 어느 카드를 집을지 X 로 고르는 UI 가
// 있으므로 좌표로 받는다.

import type { Page } from "@playwright/test";

export interface DragOptions {
  /** 누르기 시작할 뷰포트 좌표. */
  atX: number;
  atY: number;
  /** 위로 옮길 거리(px). 양수. */
  distance: number;
  /** 그 거리를 옮기는 데 쓸 시간(ms). 짧을수록 빠른 손짓 = 플릭. */
  durationMs: number;
  /** 중간 이동 횟수. 기본 5 — 실제 손가락이 내는 표본 수와 비슷하다. */
  steps?: number;
}

export interface DragResult {
  /** 실제로 걸린 시간(ms). 요청한 durationMs 와 다를 수 있다. */
  ms: number;
  /** 실제 속도(px/ms). 판정 문턱과 견줘 보라고 돌려준다. */
  velocity: number;
}

/**
 * 위로 끄는 손짓을 낸다. 빠르면 플릭, 느리면 그냥 끌기다 — 구분은 앱이 한다.
 *
 * 포인터 이벤트는 `selector` 요소에서 낸다(핸들러가 거기 붙어 있다는 전제).
 * 카드처럼 자식이 있어도 `bubbles: true` 라 위임 핸들러에 닿는다.
 */
export async function dragUp(
  page: Page,
  selector: string,
  opts: DragOptions,
): Promise<DragResult> {
  return page.evaluate(
    async ({ selector, atX, atY, distance, durationMs, steps }) => {
      const host = document.querySelector(selector);
      if (!host) throw new Error(`제스처 대상이 없다: ${selector}`);

      const at = (y: number) =>
        new PointerEvent("pointerdown", {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
          clientX: atX,
          clientY: y,
        });
      const move = (y: number) =>
        new PointerEvent("pointermove", {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
          clientX: atX,
          clientY: y,
        });
      const up = (y: number) =>
        new PointerEvent("pointerup", {
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          bubbles: true,
          clientX: atX,
          clientY: y,
        });

      host.dispatchEvent(at(atY));
      const t0 = performance.now();
      const gap = durationMs / steps;
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, gap));
        host.dispatchEvent(move(atY - (distance / steps) * i));
      }
      const ms = performance.now() - t0;
      host.dispatchEvent(up(atY - distance));
      return { ms, velocity: distance / ms };
    },
    { selector, ...opts, steps: opts.steps ?? 5 },
  );
}

/** 요소의 중심 좌표. 제스처 시작점을 잡을 때 쓴다. */
export async function centerOf(page: Page, selector: string, nth = 0) {
  const box = await page.locator(selector).nth(nth).boundingBox();
  if (!box) throw new Error(`좌표를 못 잡았다: ${selector} [${nth}]`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
