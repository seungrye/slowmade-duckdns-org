"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { Character, Scene } from "@/types/web-adventure";
import ChoiceList from "./ChoiceList";
import TypewriterText from "./TypewriterText";
import {
  getSkipVisitedEnabled,
  getTypewriterEnabled,
  isSceneVisited,
  markSceneVisited,
} from "@/lib/web-adventure/play/typewriter-options";

type Props = {
  scene: Scene;
  character: Character;
  onChoose: (choiceId: string) => void;
};

/**
 * 씬 렌더러 — fade-in + #351 타이프라이터 + #351/v3 옵션.
 *
 * 본문 출력:
 *   - 문단 별 *순차* 타이프라이터 — 한 문단 완료 후 다음 문단 시작.
 *   - 본문 영역 클릭 = 모든 문단 즉시 전체 (skipAll).
 *   - 모든 본문 완료 후 ChoiceList fade-in.
 *
 * 자동 즉시 표시 조건 (= skipSequential):
 *   - vitest / playwright / SSR — 자동 환경.
 *   - 사용자 OFF (localStorage: web-adventure:typewriter=off).
 *   - 방문 자동 skip ON + 이전 방문 기록.
 */
export default function SceneRenderer({ scene, character, onChoose }: Props) {
  const [opacity, setOpacity] = useState<0 | 100>(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [skipAll, setSkipAll] = useState(false);
  const [lastDone, setLastDone] = useState(false);

  // 자동 즉시 표시 판정 — scene 변경 마다 재평가 (옵션 토글 즉시 반영).
  const skipSequential = useMemo(() => {
    if (process.env.NODE_ENV === "test") return true;
    if (process.env.NEXT_PUBLIC_TYPEWRITER === "off") return true;
    if (typeof navigator !== "undefined" && navigator.webdriver) return true;
    if (!getTypewriterEnabled()) return true;
    if (getSkipVisitedEnabled() && isSceneVisited(scene.id)) return true;
    return false;
  }, [scene.id]);

  // 본문 빈 씬 = 즉시 완료 — ChoiceList 영구 숨김 방지.
  const emptyBody = scene.body.length === 0;
  const allComplete = skipAll || skipSequential || lastDone || emptyBody;

  useEffect(() => {
    setOpacity(0);
    setActiveIdx(0);
    setSkipAll(false);
    setLastDone(false);
    const id = window.setTimeout(() => setOpacity(100), 16);
    // 방문 기록 추가 — *진입 즉시* 기록. 다음 방문부터 자동 skip 대상.
    markSceneVisited(scene.id);
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
          // 자동 즉시 / skipAll 일 땐 모든 문단 동시 렌더.
          // 그 외에는 *현재 활성 문단* 까지만.
          if (!skipAll && !skipSequential && i > activeIdx) return null;
          const isLast = i === scene.body.length - 1;
          return (
            <TypewriterText
              key={`${scene.id}-${i}`}
              text={p}
              forceSkip={skipAll}
              onComplete={() => {
                // 현재 활성 문단 *완료* → 다음 문단 활성.
                if (i === activeIdx && i < scene.body.length - 1) {
                  setActiveIdx(i + 1);
                }
                // 마지막 문단 *완료* → ChoiceList fade-in 트리거.
                if (isLast) setLastDone(true);
              }}
            />
          );
        })}
      </div>

      {/* #351/v2 — ChoiceList 는 모든 본문 완료 *전엔 미렌더* (공간 미점유).
          완료 후 마운트되며 fade-in. */}
      {allComplete && (
        <div className="web-adventure-fade-in" data-choices-visible="true">
          <ChoiceList choices={scene.choices} character={character} onChoose={onChoose} />
        </div>
      )}
    </article>
  );
}
