// SceneRenderer — 본문/이미지/분기 렌더 + fade (#307).
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SceneRenderer from "./SceneRenderer";
import type { Character, Scene } from "@/types/web-adventure";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

const SAMPLE_CHAR: Character = {
  stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
  hp: 10, maxHp: 10, ability: "lunar", protagonist: "kael",
  stigmaErosion: 0, inventory: [], flags: {}, rerollsLeft: 0,
};

const SCENE: Scene = {
  id: "test",
  title: "테스트 씬",
  illustration: "/test.svg",
  body: ["첫 줄", "두 번째 줄", "세 번째 줄"],
  choices: [{ kind: "plain", id: "p", label: "다음으로", to: "next" }],
};

describe("SceneRenderer", () => {
  it("씬 title 표시", () => {
    render(<SceneRenderer scene={SCENE} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    expect(screen.getByText("테스트 씬")).toBeInTheDocument();
  });

  it("body 줄 모두 렌더", () => {
    render(<SceneRenderer scene={SCENE} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    expect(screen.getByText("첫 줄")).toBeInTheDocument();
    expect(screen.getByText("두 번째 줄")).toBeInTheDocument();
    expect(screen.getByText("세 번째 줄")).toBeInTheDocument();
  });

  it("illustration 이미지 src + alt 매핑", () => {
    render(<SceneRenderer scene={SCENE} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    const img = screen.getByAltText(/테스트 씬.*일러스트/);
    expect(img).toHaveAttribute("src", "/test.svg");
  });

  it("ChoiceList 가 분기 렌더", () => {
    render(<SceneRenderer scene={SCENE} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    expect(screen.getByText("다음으로")).toBeInTheDocument();
  });
});
