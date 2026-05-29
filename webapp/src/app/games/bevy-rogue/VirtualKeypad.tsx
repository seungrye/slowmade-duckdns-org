"use client";

import { useCallback, useRef, useState } from "react";
import { dispatchKey, tapKey } from "@/lib/dispatch-key";

/**
 * bevy-rogue 모바일 가상 키패드.
 *
 * 게임 코드(Bevy/winit) 는 그대로 두고, 합성 `KeyboardEvent` 를
 * 캔버스/window 에 dispatch 하는 방식으로 입력을 전달한다.
 *
 * 가시성:
 *   - Tailwind `md:hidden` 으로 모바일에서만 노출, 데스크탑에서는 숨김.
 *
 * 레이아웃:
 *   - 행 1: D-pad (상/하/좌/우, 8방향 아님 — 게임은 4방향 그리드).
 *   - 행 2: 핵심 액션 (Enter / Space / Esc).
 *   - 행 3: 패널 토글 (장비 E / 저널 J / 도감 F2 / 맵 F1).
 *   - 행 4: 카테고리 토글로 펼치는 [스킬 1/2/3] · [함정 T/Y] · [원거리 F].
 *
 * Hold vs Tap:
 *   - D-pad: 누른 동안 keydown, 떼면 keyup → 캐릭터 연속 이동.
 *   - 그 외(액션·토글·스킬): tap = keydown→keyup 한 쌍.
 */

/** 부모로부터 받을 캔버스 ref — `KeyboardEvent` dispatch 대상. */
type Props = {
  /** 게임 캔버스. 포커스 회복 + 1차 dispatch target. */
  getCanvas: () => HTMLCanvasElement | null;
};

/** 공통 버튼 베이스 클래스 (다크모드, 44px 최소 터치 영역). */
const BTN_BASE =
  "min-w-[44px] min-h-[44px] px-3 py-2 rounded-md bg-gray-700 text-gray-200 " +
  "text-sm font-medium select-none touch-none " +
  "active:bg-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 " +
  "disabled:opacity-50";

/**
 * Hold 버튼 — pointerdown/up/cancel/leave 로 keydown/keyup 페어 보장.
 * pointerEvents 만 사용하여 mouse/touch/pen 통합 처리.
 */
function HoldButton({
  label,
  ariaLabel,
  keyName,
  getCanvas,
  className = "",
}: {
  label: React.ReactNode;
  ariaLabel: string;
  keyName: string;
  getCanvas: () => HTMLCanvasElement | null;
  className?: string;
}) {
  // 같은 버튼에 여러 번 down 이 들어와도 한 번만 keydown 처리.
  const downRef = useRef(false);

  const down = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (downRef.current) return;
      downRef.current = true;
      // pointer capture → 손가락이 버튼 밖으로 미끄러져도 이 버튼이 끝까지 추적.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 일부 환경에서 미지원 — 무시.
      }
      dispatchKey(getCanvas(), keyName, "keydown");
    },
    [getCanvas, keyName],
  );

  const up = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!downRef.current) return;
      downRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dispatchKey(getCanvas(), keyName, "keyup");
    },
    [getCanvas, keyName],
  );

  return (
    <button
      type="button"
      className={`${BTN_BASE} ${className}`}
      aria-label={ariaLabel}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={(e) => {
        // pointer capture 가 안 잡힌 경우의 보험 — 버튼 밖으로 나가면 keyup.
        if (downRef.current) up(e);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/** Tap 버튼 — pointerdown 한 번에 keydown→keyup 페어 발행. */
function TapButton({
  label,
  ariaLabel,
  keyName,
  getCanvas,
  className = "",
}: {
  label: React.ReactNode;
  ariaLabel: string;
  keyName: string;
  getCanvas: () => HTMLCanvasElement | null;
  className?: string;
}) {
  const onDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      tapKey(getCanvas(), keyName);
    },
    [getCanvas, keyName],
  );

  return (
    <button
      type="button"
      className={`${BTN_BASE} ${className}`}
      aria-label={ariaLabel}
      onPointerDown={onDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

export default function VirtualKeypad({ getCanvas }: Props) {
  // 카테고리 펼침/접힘 상태 — 한 화면에 모든 키 다 안 나오므로 묶음 토글.
  const [openCat, setOpenCat] = useState<null | "skills" | "trap" | "ranged">(null);

  const toggle = (k: typeof openCat) =>
    setOpenCat((prev) => (prev === k ? null : k));

  return (
    <div
      // 모바일 전용 (md 이상 숨김). 캔버스 아래에 자연스럽게 배치.
      className="md:hidden w-full mt-3 p-3 bg-gray-900 rounded-lg flex flex-col gap-3 text-gray-200 select-none"
      // 키패드 안 터치는 페이지 스크롤/줌 트리거 X.
      style={{ touchAction: "none" }}
      aria-label="모바일 가상 키패드"
      role="group"
    >
      {/* 행 1 — D-pad. 십자형 3x3 그리드의 좌/우/상/하만 사용. */}
      <div className="flex justify-center">
        <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
          <div />
          <HoldButton
            label="▲"
            ariaLabel="이동 위쪽"
            keyName="w"
            getCanvas={getCanvas}
            className="text-lg"
          />
          <div />
          <HoldButton
            label="◀"
            ariaLabel="이동 왼쪽"
            keyName="a"
            getCanvas={getCanvas}
            className="text-lg"
          />
          {/* 가운데 — 대기(Space). D-pad 중앙에 두면 직관적. */}
          <TapButton
            label="대기"
            ariaLabel="대기 (Space)"
            keyName=" "
            getCanvas={getCanvas}
            className="text-xs bg-gray-800"
          />
          <HoldButton
            label="▶"
            ariaLabel="이동 오른쪽"
            keyName="d"
            getCanvas={getCanvas}
            className="text-lg"
          />
          <div />
          <HoldButton
            label="▼"
            ariaLabel="이동 아래쪽"
            keyName="s"
            getCanvas={getCanvas}
            className="text-lg"
          />
          <div />
        </div>
      </div>

      {/* 행 2 — 핵심 액션 */}
      <div className="grid grid-cols-3 gap-2">
        <TapButton
          label="Enter"
          ariaLabel="선택 / 장착 (Enter)"
          keyName="Enter"
          getCanvas={getCanvas}
        />
        <TapButton
          label="Esc"
          ariaLabel="패널 닫기 (Esc)"
          keyName="Escape"
          getCanvas={getCanvas}
        />
        <TapButton
          label="대기"
          ariaLabel="대기 (Space)"
          keyName=" "
          getCanvas={getCanvas}
        />
      </div>

      {/* 행 3 — 패널 토글 */}
      <div className="grid grid-cols-4 gap-2">
        <TapButton
          label="장비"
          ariaLabel="장비 패널 (E)"
          keyName="e"
          getCanvas={getCanvas}
        />
        <TapButton
          label="저널"
          ariaLabel="퀘스트 저널 (J)"
          keyName="j"
          getCanvas={getCanvas}
        />
        <TapButton
          label="도감"
          ariaLabel="도감 (F2)"
          keyName="F2"
          getCanvas={getCanvas}
        />
        <TapButton
          label="맵"
          ariaLabel="맵 토글 (F1)"
          keyName="F1"
          getCanvas={getCanvas}
        />
      </div>

      {/* 행 4 — 카테고리 토글. 한 줄에 다 안 들어가므로 그룹 단위로 펼침/접힘. */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            aria-pressed={openCat === "skills"}
            aria-label="스킬 묶음 펼치기"
            className={`${BTN_BASE} ${openCat === "skills" ? "bg-blue-700" : ""}`}
            onClick={() => toggle("skills")}
          >
            스킬 {openCat === "skills" ? "▾" : "▸"}
          </button>
          <button
            type="button"
            aria-pressed={openCat === "trap"}
            aria-label="함정 묶음 펼치기"
            className={`${BTN_BASE} ${openCat === "trap" ? "bg-blue-700" : ""}`}
            onClick={() => toggle("trap")}
          >
            함정 {openCat === "trap" ? "▾" : "▸"}
          </button>
          <button
            type="button"
            aria-pressed={openCat === "ranged"}
            aria-label="원거리 묶음 펼치기"
            className={`${BTN_BASE} ${openCat === "ranged" ? "bg-blue-700" : ""}`}
            onClick={() => toggle("ranged")}
          >
            원거리 {openCat === "ranged" ? "▾" : "▸"}
          </button>
        </div>

        {/* 펼침 컨테이너 — 카테고리 1개만 동시에 열림. */}
        {openCat === "skills" && (
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="스킬">
            <TapButton
              label="스킬1"
              ariaLabel="스킬 1"
              keyName="1"
              getCanvas={getCanvas}
            />
            <TapButton
              label="스킬2"
              ariaLabel="스킬 2"
              keyName="2"
              getCanvas={getCanvas}
            />
            <TapButton
              label="스킬3"
              ariaLabel="스킬 3"
              keyName="3"
              getCanvas={getCanvas}
            />
          </div>
        )}
        {openCat === "trap" && (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="함정">
            <TapButton
              label="함정설치"
              ariaLabel="함정 설치 (T)"
              keyName="t"
              getCanvas={getCanvas}
            />
            <TapButton
              label="함정해제"
              ariaLabel="함정 해제 (Y)"
              keyName="y"
              getCanvas={getCanvas}
            />
          </div>
        )}
        {openCat === "ranged" && (
          <div className="grid grid-cols-1 gap-2" role="group" aria-label="원거리">
            <TapButton
              label="원거리 모드"
              ariaLabel="원거리 모드 (F)"
              keyName="f"
              getCanvas={getCanvas}
            />
          </div>
        )}
      </div>
    </div>
  );
}
