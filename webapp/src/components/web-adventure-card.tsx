// WebAdventureCard — 사이트 홈 카드 (#246).
//
// 게임 진입 카드. 홈 (src/app/page.tsx) 의 상단에 ContentSection 위로 마운트.
// 데스크탑/모바일 모두 가로 폭 100% (max-w-3xl mx-auto).

import Link from 'next/link';
import Image from 'next/image';

export default function WebAdventureCard() {
  return (
    <section
      data-testid="web-adventure-card"
      className="mx-auto max-w-3xl mb-6 rounded-lg overflow-hidden border border-amber-300 bg-amber-50 shadow-sm"
    >
      <div className="md:grid md:grid-cols-[180px_1fr]">
        {/* 일러스트 */}
        <div className="relative aspect-[16/9] md:aspect-auto md:h-full bg-amber-200">
          <Image
            src="/web-adventure/scenes/town_square_dawn.jpg"
            alt="Web Adventure — 마을 광장의 새벽"
            fill
            sizes="(max-width: 768px) 100vw, 180px"
            className="object-cover"
            unoptimized
          />
        </div>

        {/* 본문 */}
        <div className="p-4 flex flex-col">
          <h2 className="text-lg md:text-xl font-bold mb-1">🎲 Web Adventure</h2>
          <p className="text-sm text-amber-900 mb-3 flex-1">
            한국형 CYOA — 30 씬, 6 엔딩, 회차 누적. 광장의 새벽에서 시작하는
            짧은 모험. 한 회차 30~45 분.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/games/web-adventure/play"
              className="rounded bg-amber-700 text-amber-50 px-3 py-1.5 text-sm font-semibold hover:bg-amber-800"
            >
              ▶ 지금 플레이
            </Link>
            <Link
              href="/games/web-adventure/gallery"
              className="rounded border border-amber-700 text-amber-800 px-3 py-1.5 text-sm hover:bg-amber-100"
            >
              🏆 엔딩 갤러리
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
