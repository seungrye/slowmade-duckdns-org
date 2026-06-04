import type { Metadata } from "next";
import Link from "next/link";

// web-adventure 진입 카드 — 서버 컴포넌트.
// 사이트 메뉴엔 노출하지 않으며 직접 URL 로만 접근(1 주차 PoC).

export const metadata: Metadata = {
  title: "Web Adventure (PoC)",
  description: "한국형 CYOA 어드벤처 — 캐릭터 생성 → 선택지 → 엔딩.",
};

export default function WebAdventureLandingPage() {
  return (
    <main className="min-h-screen bg-amber-50 text-amber-950 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-3xl md:text-4xl font-bold">Web Adventure</h1>
          <p className="text-sm text-amber-800 mt-2">한국형 CYOA — 선택의 무게를 시험하라.</p>
        </header>

        <article className="rounded-lg bg-amber-100/70 border border-amber-300 p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-3">소개</h2>
          <p className="mb-3 leading-relaxed">
            6 개 스탯과 어빌리티 1 종으로 캐릭터를 만들고, 광장에서 시작되는 짧은 모험에 임하세요.
            선택지마다 결과가 달라지며 — 1 주차 PoC 라서 아주 짧지만, 곧 길어질 예정입니다.
          </p>
          <ul className="list-disc pl-5 mb-4 text-sm text-amber-900 space-y-1">
            <li>스탯 분배: 기본 5 + 보너스 5 포인트 (스탯당 최대 +2)</li>
            <li>어빌리티: 학자의 눈 / 전사의 손 / 말솜씨 / 행운아 중 1 종</li>
            <li>선택지 3 종: 상시 / 확률 판정 / 조건부</li>
          </ul>

          <Link
            href="/games/web-adventure/play"
            className="inline-block rounded-md bg-amber-700 text-amber-50 px-5 py-2 font-semibold hover:bg-amber-800 transition-colors"
          >
            시작하기
          </Link>
        </article>

        <p className="text-xs text-amber-700 mt-4 text-center">
          1 주차 PoC — 본 게임은 곧 만들어집니다.
        </p>
      </div>
    </main>
  );
}
