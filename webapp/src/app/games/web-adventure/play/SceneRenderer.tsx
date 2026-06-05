"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Character, Scene } from "@/types/web-adventure";
import ChoiceList from "./ChoiceList";

type Props = {
  scene: Scene;
  character: Character;
  onChoose: (choiceId: string) => void;
};

/**
 * 씬 렌더러 — 4 주차 페이드 애니메이션.
 *
 * 씬 전환 시 *오래된 씬 fade-out 100ms* → *새 씬 fade-in 100ms*.
 * scene.id 가 바뀔 때마다 React key 변경 + opacity 0 → 1 transition.
 */
export default function SceneRenderer({ scene, character, onChoose }: Props) {
  // scene.id 변경 시 opacity 0 → 100ms → 1 로 fade-in.
  const [opacity, setOpacity] = useState<0 | 100>(0);
  useEffect(() => {
    setOpacity(0);
    // 다음 paint frame 에서 100 으로 — Tailwind transition 으로 자연스러운 fade.
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

      <div className="space-y-2 mb-5">
        {scene.body.map((p, i) => (
          <p key={i} className="leading-relaxed">
            {p}
          </p>
        ))}
      </div>

      <ChoiceList choices={scene.choices} character={character} onChoose={onChoose} />
    </article>
  );
}
