import type { Metadata } from "next";
import BevyRogueClient from "./BevyRogueClient";

// BevyRogueClient 는 "use client" 컴포넌트.
// wasm 글루는 그 안의 useEffect 에서만 dynamic import 하므로 SSR 단계에서
// window/document 접근이 일어나지 않는다(빌드도 안전).

export const metadata: Metadata = {
  title: "Bevy Rogue",
  description: "Bevy 로 만든 로그라이크 게임을 브라우저(WASM)에서 바로 플레이.",
};

export default function BevyRoguePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 py-6 px-4">
      <div className="max-w-6xl mx-auto">
        <header className="mb-4 text-center">
          <h1 className="text-2xl md:text-3xl font-bold">Bevy Rogue</h1>
          <p className="text-sm text-gray-400 mt-1">
            Rust + Bevy 로 만든 로그라이크 — 브라우저에서 WASM 으로 실행됩니다.
          </p>
        </header>
        <BevyRogueClient />
      </div>
    </main>
  );
}
