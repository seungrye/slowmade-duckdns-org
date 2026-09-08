// WebAdventureCard - the site's home card (#246 -> #253's Eternia tone).
//
// The game's entry card. It is *not currently mounted* in the home page.tsx (the user reverted #246).
// Kept so it can be reused elsewhere (a games section, a separate landing page).

import Link from 'next/link';

export default function WebAdventureCard() {
  return (
    <section
      data-testid="web-adventure-card"
      className="mx-auto max-w-3xl mb-6 rounded-lg overflow-hidden border border-indigo-700/50 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 shadow-lg"
    >
      <div className="p-5 flex flex-col">
        <h2 className="text-lg md:text-xl font-bold mb-1 text-indigo-100">
          ✨ 에테르니아의 추락
        </h2>
        <p className="text-sm text-indigo-200/90 mb-3 flex-1">
          천체 마법공학 다크 에픽 — 3 주인공 (Kael / Rin / Solwen), 6 엔딩, 회차 누적.
          세 달이 정렬한다. 마법이 사라진다. 부유 도시들이 추락한다. 너의 선택은?
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/games/web-adventure/play"
            className="rounded bg-indigo-600 text-indigo-50 px-3 py-1.5 text-sm font-semibold hover:bg-indigo-500 transition-colors"
          >
            ▶ 지금 플레이
          </Link>
          <Link
            href="/games/web-adventure/gallery"
            className="rounded border border-indigo-400/60 text-indigo-100 px-3 py-1.5 text-sm hover:bg-indigo-900/40 transition-colors"
          >
            🏆 엔딩 갤러리
          </Link>
        </div>
      </div>
    </section>
  );
}
