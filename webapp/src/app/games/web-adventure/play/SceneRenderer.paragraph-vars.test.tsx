// SceneRenderer - whether the body's <<set>> really feeds the per-paragraph interpolation (#371).
// @vitest-environment jsdom
//
// The test environment has skipSequential true, so the paragraphs are drawn all at once. So the per-paragraph values
// are visible as they are. (<<wait>> cannot be measured here because of that skip -
// the revealSchedule pure-function tests cover it.)

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
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
  id: "vars",
  title: "테스트 씬",
  illustration: "/test.svg",
  body: [],
  choices: [{ kind: "plain", id: "p", label: "다음으로", to: "next" }],
};

/** The body area's paragraph texts, in order. So a paragraph number can be paired with the value shown. */
function bodyParagraphs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-typewriter-area] p")).map(
    (el) => el.textContent ?? "",
  );
}

describe("SceneRenderer — 문단별 <<set>> 보간", () => {
  it("<<set>> 은 그 문단부터 적용되고 앞 문단은 그대로다 (character.variables 도 덮는다)", () => {
    const scene: Scene = {
      ...SCENE,
      id: "set-mid",
      body: [
        "{{이름}} · {{별명}}",
        "<<set 이름 카엘>><<set 별명 그림자>>{{이름}} · {{별명}}",
        "{{이름}} · {{별명}}",
      ],
    };
    // The nickname is already in character.variables - paragraph 1's <<set>> has to override it.
    const char: Character = { ...SAMPLE_CHAR, variables: { 별명: "무명" } };

    const { container } = render(
      <SceneRenderer scene={scene} character={char} onChoose={vi.fn()} />,
    );

    expect(bodyParagraphs(container)).toEqual([
      "{{이름}} · 무명", // set 앞 — 미정의는 원문 유지, 별명은 캐릭터 값
      "카엘 · 그림자", // set 이 든 문단 자신부터 새 값
      "카엘 · 그림자", // 뒤 문단으로 이어진다
    ]);
  });

  it("<<set>> 값은 그 씬 안에서만 산다 — 씬을 갈아 끼우면 사라진다", () => {
    const first: Scene = { ...SCENE, id: "set-a", body: ["<<set 이름 카엘>>{{이름}}"] };
    const second: Scene = { ...SCENE, id: "set-b", body: ["{{이름}}"] };

    const { container, rerender } = render(
      <SceneRenderer scene={first} character={SAMPLE_CHAR} onChoose={vi.fn()} />,
    );
    expect(bodyParagraphs(container)).toEqual(["카엘"]);

    rerender(<SceneRenderer scene={second} character={SAMPLE_CHAR} onChoose={vi.fn()} />);
    expect(bodyParagraphs(container)).toEqual(["{{이름}}"]);
  });
});
