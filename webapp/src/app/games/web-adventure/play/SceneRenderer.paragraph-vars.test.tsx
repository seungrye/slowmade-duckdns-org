// SceneRenderer — 본문 <<set>> 이 문단별 보간에 실제로 물렸는지 (#371).
// @vitest-environment jsdom
//
// 테스트 환경은 skipSequential 이 참이라 문단이 한꺼번에 그려진다. 그래서 문단별 값이
// 그대로 눈에 보인다. (<<wait>> 은 그 스킵 때문에 여기서 잴 수 없다 —
// revealSchedule 순수 함수 테스트가 덮는다.)

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

/** 본문 영역의 문단 텍스트를 순서대로. 문단 번호와 보이는 값을 짝지어 보기 위함. */
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
    // 별명은 character.variables 에 이미 있다 — 문단 1 의 <<set>> 이 이걸 덮어야 한다.
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
