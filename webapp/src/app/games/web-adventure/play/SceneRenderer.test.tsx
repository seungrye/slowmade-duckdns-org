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

  it("본문 {{변수}} 를 character.variables 로 치환", () => {
    const scene: Scene = { ...SCENE, body: ["너는 {{route}}로 스며든다"] };
    const char: Character = { ...SAMPLE_CHAR, variables: { route: "정문 초소" } };
    render(<SceneRenderer scene={scene} character={char} onChoose={vi.fn()} />);
    expect(screen.getByText("너는 정문 초소로 스며든다")).toBeInTheDocument();
  });

  it("<< 디렉티브 >> 는 본문에 문자로 노출되지 않는다", () => {
    const scene: Scene = { ...SCENE, body: ["덤불이 <<sfx 바스락>> 흔들린다"] };
    const { container } = render(<SceneRenderer scene={scene} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    expect(container.textContent).toContain("흔들린다");
    expect(container.textContent).not.toContain("<<");
    expect(container.textContent).not.toContain("바스락");
  });

  it("<<img … impact>> 를 삽화 이미지로 렌더", () => {
    const scene: Scene = { ...SCENE, body: ["<<img /a/harbor.png impact>>"] };
    render(<SceneRenderer scene={scene} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    const img = screen.getByAltText("삽화 /a/harbor.png");
    expect(img).toHaveAttribute("src", "/a/harbor.png");
  });

  it("<<fx flash>> → 화면효과 오버레이 발동", () => {
    const scene: Scene = { ...SCENE, body: ["번쩍 <<fx flash>>"] };
    render(<SceneRenderer scene={scene} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    const overlay = screen.getByTestId("fx-overlay");
    expect(overlay).toHaveAttribute("data-fx", "flash");
    expect(overlay).toHaveClass("wa-fx-flash");
  });

  it("<<fx shake>> → 씬 카드에 wa-fx-shake 적용, 오버레이 없음", () => {
    const scene: Scene = { ...SCENE, body: ["흔들 <<fx shake>>"] };
    render(<SceneRenderer scene={scene} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    expect(screen.getByTestId("scene-renderer")).toHaveClass("wa-fx-shake");
    expect(screen.queryByTestId("fx-overlay")).toBeNull();
  });
});
