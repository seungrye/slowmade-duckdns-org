"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Character, Scene } from "@/types/web-adventure";
import ChoiceList from "./ChoiceList";
import TypewriterText from "./TypewriterText";

type Props = {
  scene: Scene;
  character: Character;
  onChoose: (choiceId: string) => void;
};

/**
 * 씬 렌더러 — fade-in + #351 타이프라이터.
 *
 * 본문 출력:
 *   - 문단 별 *순차* 타이프라이터 — 한 문단 완료 후 다음 문단 시작.
 *   - 어떤 문단이든 클릭 시 즉시 전체 표시 (skip).
 *   - 본문 영역 어딘가 클릭 = 모든 문단 즉시 전체 (skipAll).
 *   - 분기 버튼은 출력 중에도 보임 (사용자 빠른 진행 허용).
 */
export default function SceneRenderer({ scene, character, onChoose }: Props) {
  // scene.id 변경 시 opacity 0 → 100ms → 1 로 fade-in.
  const [opacity, setOpacity] = useState<0 | 100>(0);
  // 현재 출력 중인 문단 index (다음 문단은 그 이후 시작).
  const [activeIdx, setActiveIdx] = useState(0);
  // 사용자 skipAll (본문 영역 클릭) — 모든 문단 즉시 전체.
  const [skipAll, setSkipAll] = useState(false);

  useEffect(() => {
    setOpacity(0);
    setActiveIdx(0);
    setSkipAll(false);
    const id = window.setTimeout(() => setOpacity(100), 16);
    return () => window.clearTimeout(id);
  }, [scene.id]);

  return (
    <article
      key={scene.id}
      className="rounded-lg bg-amber-100/70 border border-amber-300 p-4 shadow-sm transition-opacity duration-100"
      style={{ opacity: opacity / 100 }}
      data-testid="scene-renderer"
    >
      <div className="relative w-full aspect-[16/9] rounded-md overflow-hidden bg-amber-200 mb-4">
        <Image
          src={scene.illustration}
          alt={`${scene.title} 일러스트`}
          fill
          sizes="(max-width: 768px) 100vw, 640px"
          className="object-cover"
          unoptimized
        />
      </div>

      <h2 className="text-2xl font-bold mb-3">{scene.title}</h2>

      <div
        className="space-y-2 mb-5"
        onClick={() => setSkipAll(true)}
        data-typewriter-area
      >
        {scene.body.map((p, i) => {
          // 순차 렌더 skip 조건 — TypewriterText 가 disable 되는 환경들.
          //   process.env.NODE_ENV='test' (vitest) / navigator.webdriver
          //   (playwright) / NEXT_PUBLIC_TYPEWRITER='off' / localStorage off.
          //   → 모든 문단 한번에 렌더 (자동화 / 사용자 옵션).
          const skipSequential =
            process.env.NODE_ENV === "test" ||
            process.env.NEXT_PUBLIC_TYPEWRITER === "off" ||
            (typeof navigator !== "undefined" && navigator.webdriver) ||
            (typeof window !== "undefined" &&
              (() => {
                try {
                  return (
                    window.localStorage.getItem("web-adventure:typewriter") ===
                    "off"
                  );
                } catch {
                  return false;
                }
              })());
          if (!skipAll && !skipSequential && i > activeIdx) return null;
          return (
            <TypewriterText
              key={`${scene.id}-${i}`}
              text={p}
              forceSkip={skipAll}
              onComplete={() => {
                // 마지막 문단 X → 다음 문단 활성.
                if (i === activeIdx && i < scene.body.length - 1) {
                  setActiveIdx(i + 1);
                }
              }}
            />
          );
        })}
      </div>

      <ChoiceList choices={scene.choices} character={character} onChoose={onChoose} />
    </article>
  );
}
