'use client';

/**
 * 프로필의 '오늘의 운세' 섹션 (#388).
 *
 * 우하단 토스트가 데려오는 곳. 처음엔 카드 뒷면, 클릭하면 뒤집혀 오늘의 타로 풀이가 열린다.
 * 토스트에서 `#today-fortune` 해시로 들어오면 자동으로 뒤집는다.
 * 사이트 스킨(흰/회색·rounded-lg·shadow-sm) + 보라 액센트.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

type Fortune = {
  dateKey: string;
  orientation: 'up' | 'rev';
  reading: string;
  readingSource: 'llm' | 'template';
  card: { nameKr: string; nameEn: string; keywords: string[]; imageUrl: string };
};

export default function TodayFortuneSection() {
  const { status } = useSession();
  const [data, setData] = useState<Fortune | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') { setLoading(false); return; }
    let cancelled = false;
    fetch('/api/fortune/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => { if (!cancelled) setData(res?.data ?? null); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status]);

  const reveal = useCallback(() => {
    setRevealed(true);
    // 프로필에서 직접 열어도 '봤음'으로 기록 — 토스트가 다시 뜨지 않게.
    fetch('/api/fortune/seen', { method: 'POST' }).catch(() => {});
  }, []);

  // 토스트에서 #today-fortune 로 들어오면 자동으로 뒤집고 스크롤.
  useEffect(() => {
    if (!data) return;
    if (typeof window !== 'undefined' && window.location.hash === '#today-fortune') {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      cardRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      const t = setTimeout(reveal, reduce ? 0 : 500);
      return () => clearTimeout(t);
    }
  }, [data, reveal]);

  if (status !== 'authenticated') return null;

  return (
    <section id="today-fortune" className="mt-8 scroll-mt-20">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span className="text-violet-600 dark:text-violet-400">✦</span> 오늘의 운세
        {data && (
          <span className="text-sm font-normal text-gray-400 tabular-nums">· {data.dateKey}</span>
        )}
      </h2>

      <div className="rounded-lg border border-violet-200 dark:border-violet-900/60 bg-white dark:bg-gray-800 p-5 shadow-sm">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">오늘의 카드를 여는 중…</div>
        ) : !data ? (
          <div className="py-10 text-center text-sm text-gray-400">운세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[150px_1fr] sm:items-start">
            {/* 카드 */}
            <div
              ref={cardRef}
              role="button"
              tabIndex={0}
              aria-label="오늘의 타로 카드 뒤집기"
              onClick={() => !revealed && reveal()}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !revealed) { e.preventDefault(); reveal(); } }}
              className="mx-auto w-[150px] cursor-pointer [perspective:1100px] sm:mx-0"
            >
              <div
                className="relative aspect-[60/103] w-full transition-transform duration-700 [transform-style:preserve-3d]"
                style={{ transform: revealed ? 'rotateY(180deg)' : undefined }}
              >
                {/* 뒷면 */}
                <div className="absolute inset-0 grid place-items-center gap-2 rounded-xl border border-violet-500 bg-gray-50 dark:bg-gray-900 [backface-visibility:hidden]">
                  <div className="grid aspect-square w-[56%] place-items-center rounded-lg border-[1.5px] border-violet-500 text-violet-600 dark:text-violet-400">
                    <span className="text-3xl">✦</span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">뒤집어 보기</span>
                </div>
                {/* 앞면 */}
                <div className="absolute inset-0 overflow-hidden rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  {imgOk ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.card.imageUrl}
                      alt={`${data.card.nameKr} (${data.card.nameEn})`}
                      onError={() => setImgOk(false)}
                      className="h-full w-full object-cover"
                      style={{ transform: data.orientation === 'rev' ? 'rotate(180deg)' : undefined }}
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center p-3 text-center">
                      <div>
                        <div className="text-xs font-semibold tracking-wide text-violet-600 dark:text-violet-400">{data.card.nameEn}</div>
                        <div className="mt-1 text-lg font-bold">{data.card.nameKr}</div>
                        <div className="mt-1 text-[11px] text-gray-400">{data.orientation === 'rev' ? '역방향' : '정방향'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 풀이 */}
            <div>
              {!revealed ? (
                <p className="text-sm leading-7 text-gray-500 dark:text-gray-400">
                  카드를 <b className="text-violet-600 dark:text-violet-400">뒤집어</b> 오늘의 메시지를 확인하세요.
                </p>
              ) : (
                <div>
                  <div className="text-xs font-semibold tracking-wide text-violet-600 dark:text-violet-400">{data.card.nameEn}</div>
                  <div className="text-xl font-bold">{data.card.nameKr}
                    <span className="ml-2 align-middle text-xs font-normal text-gray-400">{data.orientation === 'rev' ? '역방향' : '정방향'}</span>
                  </div>
                  <div className="my-3 flex flex-wrap gap-1.5">
                    {data.card.keywords.map((k) => (
                      <span key={k} className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">{k}</span>
                    ))}
                  </div>
                  <p className="text-[15px] leading-8">{data.reading}</p>
                  {data.readingSource === 'template' && (
                    <p className="mt-2 text-xs text-gray-400">오늘 밤 더 정성 들인 풀이로 채워져요.</p>
                  )}
                  <p className="mt-3 text-xs text-gray-400">하루 한 번, 자정에 새 카드가 열립니다.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 생일 넣으면 사주도 — 2단계 안내 */}
        <div className="mt-4 flex items-center gap-3 border-t border-dashed border-gray-200 pt-4 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            생년월일을 남기면 <b className="text-violet-600 dark:text-violet-400">사주 풀이</b>도 곧 여기 함께 열려요.
          </p>
        </div>
      </div>
    </section>
  );
}
