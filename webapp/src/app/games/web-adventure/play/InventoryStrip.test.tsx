// InventoryStrip — HP/재굴림/인벤 그룹화 표시 (#301).
// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InventoryStrip from "./InventoryStrip";

describe("InventoryStrip", () => {
  it("HP / 재굴림 표시", () => {
    render(<InventoryStrip hp={8} maxHp={10} rerollsLeft={2} inventory={[]} />);
    expect(screen.getByText(/8/)).toBeInTheDocument();
    expect(screen.getByText(/\/ 10/)).toBeInTheDocument();
    // 재굴림 숫자 (2 가 있는 span)
    const rerollHits = screen.getAllByText(/2/);
    expect(rerollHits.length).toBeGreaterThan(0);
  });

  it("빈 인벤 → '비어 있음' 메시지", () => {
    render(<InventoryStrip hp={10} maxHp={10} rerollsLeft={0} inventory={[]} />);
    expect(screen.getByText(/비어 있음/)).toBeInTheDocument();
  });

  it("동일 아이템 3 개 → '환자복 × 3'", () => {
    render(
      <InventoryStrip
        hp={10}
        maxHp={10}
        rerollsLeft={0}
        inventory={["patient_gown", "patient_gown", "patient_gown"]}
        onUseItem={() => {}}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    expect(screen.getByText(/환자복/)).toBeInTheDocument();
    expect(screen.getByText(/× 3|x 3/)).toBeInTheDocument();
  });

  it("서로 다른 2 아이템 — 각자 표시", () => {
    render(
      <InventoryStrip
        hp={10}
        maxHp={10}
        rerollsLeft={0}
        inventory={["ether_refined_water", "mana_stone_fragment"]}
        onUseItem={() => {}}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    expect(screen.getByText(/정제수/)).toBeInTheDocument();
    expect(screen.getByText(/파편|마력석/)).toBeInTheDocument();
  });
});
