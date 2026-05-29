// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VirtualKeypad from "./VirtualKeypad";

/**
 * VirtualKeypad 단위 테스트.
 *
 * 게임 코드 변경 없이 `KeyboardEvent` dispatch 로 키 입력을 전달한다는
 * 핵심 계약을 검증한다.
 */

describe("VirtualKeypad — 기본 렌더링", () => {
  it("D-pad 4방향 버튼이 한국어 aria-label 과 함께 모두 렌더된다", () => {
    const getCanvas = () => document.createElement("canvas");
    render(<VirtualKeypad getCanvas={getCanvas} />);

    expect(screen.getByLabelText("이동 위쪽")).toBeInTheDocument();
    expect(screen.getByLabelText("이동 아래쪽")).toBeInTheDocument();
    expect(screen.getByLabelText("이동 왼쪽")).toBeInTheDocument();
    expect(screen.getByLabelText("이동 오른쪽")).toBeInTheDocument();
  });

  it("핵심 액션과 패널 토글 버튼이 모두 있다", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    expect(screen.getByLabelText("선택 / 장착 (Enter)")).toBeInTheDocument();
    expect(screen.getByLabelText("패널 닫기 (Esc)")).toBeInTheDocument();
    expect(screen.getByLabelText("장비 패널 (E)")).toBeInTheDocument();
    expect(screen.getByLabelText("퀘스트 저널 (J)")).toBeInTheDocument();
    expect(screen.getByLabelText("도감 (F2)")).toBeInTheDocument();
    expect(screen.getByLabelText("맵 토글 (F1)")).toBeInTheDocument();
  });

  it("카테고리 토글 버튼(스킬·함정·원거리) 이 노출되며 클릭 전 펼침 내용은 숨김", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    expect(screen.getByLabelText("스킬 묶음 펼치기")).toBeInTheDocument();
    expect(screen.getByLabelText("함정 묶음 펼치기")).toBeInTheDocument();
    expect(screen.getByLabelText("원거리 묶음 펼치기")).toBeInTheDocument();

    // 처음에는 스킬 1~3 / 함정 / 원거리 버튼이 보이지 않음.
    expect(screen.queryByLabelText("스킬 1")).toBeNull();
    expect(screen.queryByLabelText("함정 설치 (T)")).toBeNull();
    expect(screen.queryByLabelText("원거리 모드 (F)")).toBeNull();
  });

  it("스킬 카테고리 토글 시 1/2/3 버튼이 나타난다", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    fireEvent.click(screen.getByLabelText("스킬 묶음 펼치기"));

    expect(screen.getByLabelText("스킬 1")).toBeInTheDocument();
    expect(screen.getByLabelText("스킬 2")).toBeInTheDocument();
    expect(screen.getByLabelText("스킬 3")).toBeInTheDocument();
  });

  it("함정 카테고리 토글 시 설치/해제 버튼이 나타난다", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    fireEvent.click(screen.getByLabelText("함정 묶음 펼치기"));

    expect(screen.getByLabelText("함정 설치 (T)")).toBeInTheDocument();
    expect(screen.getByLabelText("함정 해제 (Y)")).toBeInTheDocument();
  });

  it("이미 열린 카테고리를 다시 누르면 접힌다", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    const skillBtn = screen.getByLabelText("스킬 묶음 펼치기");
    fireEvent.click(skillBtn);
    expect(screen.getByLabelText("스킬 1")).toBeInTheDocument();

    fireEvent.click(skillBtn);
    expect(screen.queryByLabelText("스킬 1")).toBeNull();
  });
});

describe("VirtualKeypad — md:hidden 으로 모바일 전용 표시", () => {
  it("루트 컨테이너에 md:hidden Tailwind 클래스가 포함된다", () => {
    const getCanvas = () => null;
    const { container } = render(<VirtualKeypad getCanvas={getCanvas} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("md:hidden");
  });
});

describe("VirtualKeypad — TapButton 클릭이 KeyboardEvent dispatch 를 트리거", () => {
  let windowDownSpy: ReturnType<typeof vi.fn>;
  let windowUpSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    windowDownSpy = vi.fn();
    windowUpSpy = vi.fn();
    window.addEventListener("keydown", windowDownSpy as EventListener);
    window.addEventListener("keyup", windowUpSpy as EventListener);
  });

  afterEach(() => {
    window.removeEventListener("keydown", windowDownSpy as EventListener);
    window.removeEventListener("keyup", windowUpSpy as EventListener);
  });

  it("Enter 버튼을 pointerDown 하면 Enter keydown+keyup 가 window 로 전파된다", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    const btn = screen.getByLabelText("선택 / 장착 (Enter)");
    fireEvent.pointerDown(btn);

    expect(windowDownSpy).toHaveBeenCalledTimes(1);
    expect(windowUpSpy).toHaveBeenCalledTimes(1);
    expect((windowDownSpy.mock.calls[0][0] as KeyboardEvent).key).toBe("Enter");
    expect((windowUpSpy.mock.calls[0][0] as KeyboardEvent).key).toBe("Enter");
  });

  it("장비(E) 버튼은 'e' 키로 dispatch 된다", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    fireEvent.pointerDown(screen.getByLabelText("장비 패널 (E)"));

    expect((windowDownSpy.mock.calls[0][0] as KeyboardEvent).key).toBe("e");
    expect((windowDownSpy.mock.calls[0][0] as KeyboardEvent).code).toBe("KeyE");
  });
});

describe("VirtualKeypad — HoldButton 은 pointerDown=keydown / pointerUp=keyup", () => {
  let downSpy: ReturnType<typeof vi.fn>;
  let upSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    downSpy = vi.fn();
    upSpy = vi.fn();
    window.addEventListener("keydown", downSpy as EventListener);
    window.addEventListener("keyup", upSpy as EventListener);
  });

  afterEach(() => {
    window.removeEventListener("keydown", downSpy as EventListener);
    window.removeEventListener("keyup", upSpy as EventListener);
  });

  it("위쪽 D-pad 를 pointerDown 만 하면 keydown 만 발행, pointerUp 후 keyup", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    const up = screen.getByLabelText("이동 위쪽");

    fireEvent.pointerDown(up, { pointerId: 1 });
    expect(downSpy).toHaveBeenCalledTimes(1);
    expect(upSpy).not.toHaveBeenCalled();
    expect((downSpy.mock.calls[0][0] as KeyboardEvent).key).toBe("w");

    fireEvent.pointerUp(up, { pointerId: 1 });
    expect(upSpy).toHaveBeenCalledTimes(1);
    expect((upSpy.mock.calls[0][0] as KeyboardEvent).key).toBe("w");
  });

  it("중복 pointerDown 은 keydown 을 한 번만 발행한다 (re-entry guard)", () => {
    const getCanvas = () => null;
    render(<VirtualKeypad getCanvas={getCanvas} />);

    const left = screen.getByLabelText("이동 왼쪽");
    fireEvent.pointerDown(left, { pointerId: 1 });
    fireEvent.pointerDown(left, { pointerId: 1 });

    expect(downSpy).toHaveBeenCalledTimes(1);
  });
});
