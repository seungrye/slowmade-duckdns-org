"use client";

import Image from "next/image";
import type { Character, Scene } from "@/types/web-adventure";
import ChoiceList from "./ChoiceList";

type Props = {
  scene: Scene;
  character: Character;
  onChoose: (choiceId: string) => void;
};

export default function SceneRenderer({ scene, character, onChoose }: Props) {
  return (
    <article className="rounded-lg bg-amber-100/70 border border-amber-300 p-4 shadow-sm">
      <div className="relative w-full aspect-[16/9] rounded-md overflow-hidden bg-amber-200 mb-4">
        {/* placeholder SVG (1 주차) — 4 주차에 CC0 도트 일러스트로 교체. */}
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
