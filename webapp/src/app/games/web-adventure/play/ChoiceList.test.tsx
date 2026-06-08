// ChoiceList — 분기 종류별 렌더 + hidden 필터 + 클릭 콜백 (#301).
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChoiceList from "./ChoiceList";
import type { Character, Choice } from "@/types/web-adventure";

function makeChar(partial: Partial<Character> = {}): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 10, maxHp: 10, ability: "lunar", protagonist: "kael",
    stigmaErosion: 0, inventory: [], flags: {}, rerollsLeft: 0,
    ...partial,
  };
}

describe("ChoiceList", () => {
  it("plain — 라벨 그대로 렌더 + 클릭 시 onChoose(id)", () => {
    const onChoose = vi.fn();
    const c: Choice = { kind: "plain", id: "p", label: "다음으로", to: "x" };
    render(<ChoiceList choices={[c]} character={makeChar()} onChoose={onChoose} />);
    fireEvent.click(screen.getByText("다음으로"));
    expect(onChoose).toHaveBeenCalledWith("p");
  });

  it("probability — '[확률 N%]' 표시 + 클릭 콜백", () => {
    const onChoose = vi.fn();
    const c: Choice = {
      kind: "probability", id: "pr", label: "치기", stat: "str",
      difficulty: 12, onSuccess: "ok", onFailure: "fail",
    };
    render(<ChoiceList choices={[c]} character={makeChar()} onChoose={onChoose} />);
    // 라벨 = '[확률 N%]'. 옛 '[힘 N%]' 같은 stat 명 부재.
    expect(screen.getByText(/\[확률 \d+%\]/)).toBeInTheDocument();
    expect(screen.queryByText(/\[힘 \d+%\]/)).toBeNull();
    fireEvent.click(screen.getByText(/치기/));
    expect(onChoose).toHaveBeenCalledWith("pr");
  });

  it("conditional hidden + flag 미충족 → 표시 안 함", () => {
    const c: Choice = {
      kind: "conditional", id: "c", label: "비밀",
      condition: { kind: "flag", key: "knowsAscensionPlot" }, to: "x", hidden: true,
    };
    render(<ChoiceList choices={[c]} character={makeChar()} onChoose={vi.fn()} />);
    expect(screen.queryByText("비밀")).toBeNull();
    expect(screen.getByText(/선택할 수 있는 행동이 없다/)).toBeInTheDocument();
  });

  it("conditional hidden + flag 충족 → 표시", () => {
    const c: Choice = {
      kind: "conditional", id: "c", label: "비밀",
      condition: { kind: "flag", key: "knowsAscensionPlot" }, to: "x", hidden: true,
    };
    render(
      <ChoiceList
        choices={[c]}
        character={makeChar({ flags: { knowsAscensionPlot: true } })}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByText("비밀")).toBeInTheDocument();
  });

  it("conditional 일반 (hidden=false) + 미충족 → 표시 (disabled 또는 사유)", () => {
    const c: Choice = {
      kind: "conditional", id: "c", label: "조건",
      condition: { kind: "minStat", stat: "int", min: 20 }, to: "x",
    };
    render(<ChoiceList choices={[c]} character={makeChar()} onChoose={vi.fn()} />);
    // 미숨김 conditional — 라벨 보임 (사유는 UI 표시 여부 별도).
    expect(screen.getByText(/조건/)).toBeInTheDocument();
  });

  it("선택 가능 0 → '선택할 수 있는 행동이 없다' 메시지", () => {
    render(<ChoiceList choices={[]} character={makeChar()} onChoose={vi.fn()} />);
    expect(screen.getByText(/선택할 수 있는 행동이 없다/)).toBeInTheDocument();
  });
});
