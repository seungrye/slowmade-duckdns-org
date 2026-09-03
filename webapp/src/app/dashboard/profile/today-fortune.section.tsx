'use client';

/**
 * 프로필의 '오늘의 운세' 섹션 (#388·#390).
 *
 * 우하단 토스트가 데려오는 곳. 타로/사주 탭. 타로는 카드 뒷면→클릭/해시 진입 시 뒤집힘→풀이.
 * 사주는 생일이 있으면 미니 사주판 + 오늘의 풀이, 없으면 생일 등록 안내.
 * 오늘 확인했으면 다음날까지 뒤집힌 채로 유지(seen). 사이트 스킨 + 보라 액센트.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

type Pillar = { ganzhi: string; gan: string; zhi: string; ganKr: string; zhiKr: string; ganEl: string; zhiEl: string };
type SajuBlock = {
  pillars: { year: Pillar; month: Pillar; day: Pillar; time: Pillar | null };
  dayGanKr: string; dayEl: string; elements: Record<string, number>;
  iljin: { ganzhi: string; gan: string; zhi: string; ganKr: string; zhiKr: string; ganEl: string };
  relation: { key: string; meaning: string };
  reading: string; readingSource: 'llm' | 'template'; hasBirthTime: boolean;
};
type Fortune = {
  dateKey: string;
  seen: boolean;
  orientation: 'up' | 'rev';
  reading: string;
  readingSource: 'llm' | 'template';
  card: { nameKr: string; nameEn: string; keywords: string[]; imageUrl: string };
  saju: SajuBlock | null;
};

import { EL_COLOR, ELEMENTS, meaningOf, ZHI_EL } from '@/lib/fortune/saju-labels';
const ZHI_EL_OF = (z: string) => ZHI_EL[z] ?? '토';

export default function TodayFortuneSection() {
  const { status } = useSession();
  const [data, setData] = useState<Fortune | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const [tab, setTab] = useState<'tarot' | 'saju'>('tarot');
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') { setLoading(false); return; }
    let cancelled = false;
    fetch('/api/fortune/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled) return;
        const f = res?.data ?? null;
        setData(f);
        if (f?.seen) setRevealed(true); // 오늘 확인했으면 뒤집힌 채로
      })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status]);

  const reveal = useCallback(() => {
    setRevealed(true);
    fetch('/api/fortune/seen', { method: 'POST' }).catch(() => {});
  }, []);

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
        {data && <span className="text-sm font-normal text-gray-400 tabular-nums">· {data.dateKey}</span>}
      </h2>

      <div className="rounded-lg border border-violet-200 dark:border-violet-900/60 bg-white dark:bg-gray-800 p-5 shadow-sm">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-400">오늘의 운세를 여는 중…</div>
        ) : !data ? (
          <div className="py-10 text-center text-sm text-gray-400">운세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</div>
        ) : (
          <>
            {/* 타로 / 사주 탭 */}
            <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
              {(['tarot', 'saju'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={
                    '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ' +
                    (tab === t
                      ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')
                  }
                >
                  {t === 'tarot' ? '타로' : '사주'}
                </button>
              ))}
            </div>

            {tab === 'tarot' ? (
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
                    <div className="absolute inset-0 grid place-items-center gap-2 rounded-xl border border-violet-500 bg-gray-50 dark:bg-gray-900 [backface-visibility:hidden]">
                      <div className="grid aspect-square w-[56%] place-items-center rounded-lg border-[1.5px] border-violet-500 text-violet-600 dark:text-violet-400">
                        <span className="text-3xl">✦</span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">뒤집어 보기</span>
                    </div>
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
            ) : (
              <SajuPanel saju={data.saju} />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function ElChar({ hanja, kr, el }: { hanja: string; kr: string; el: string }) {
  const meaning = meaningOf(hanja);
  return (
    <span className="group/char relative inline-flex cursor-help items-baseline gap-0.5" tabIndex={0}>
      <span style={{ color: EL_COLOR[el as keyof typeof EL_COLOR] }} className="font-bold">{hanja}</span>
      <span className="text-[10px] text-gray-400">{kr}</span>
      {meaning && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-max max-w-[200px] -translate-x-1/2 rounded-md bg-gray-900 px-2 py-1 text-[11px] font-normal leading-snug text-gray-50 opacity-0 shadow-lg transition-opacity group-hover/char:opacity-100 group-focus/char:opacity-100 dark:bg-gray-700"
        >
          {meaning}
        </span>
      )}
    </span>
  );
}

function PillarBox({ label, p, me }: { label: string; p: Pillar | null; me?: boolean }) {
  return (
    <div className={
      'rounded-lg border p-2 text-center ' +
      (me ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900')
    }>
      <div className={'text-[10px] ' + (me ? 'font-semibold text-violet-600 dark:text-violet-400' : 'text-gray-400')}>{label}</div>
      {p ? (
        <div className="mt-1">
          <div className="text-lg leading-tight"><ElChar hanja={p.gan} kr={p.ganKr} el={p.ganEl} /></div>
          <div className="text-lg leading-tight"><ElChar hanja={p.zhi} kr={p.zhiKr} el={p.zhiEl} /></div>
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-gray-400">미상</div>
      )}
    </div>
  );
}

function SajuPanel({ saju }: { saju: SajuBlock | null }) {
  if (!saju) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          <b className="text-violet-600 dark:text-violet-400">생년월일</b>을 남기면 오늘의 사주 운세가 열려요.
        </p>
        <a href="#birthday-card" className="mt-3 inline-block rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-600 hover:border-violet-500 dark:border-violet-800 dark:text-violet-400">
          생일 등록하러 가기 ↑
        </a>
      </div>
    );
  }
  const { pillars } = saju;
  return (
    <div>
      {/* 미니 사주판 — 년·월·일·시(일주 강조) */}
      <div className="grid grid-cols-4 gap-2">
        <PillarBox label="년주" p={pillars.year} />
        <PillarBox label="월주" p={pillars.month} />
        <PillarBox label="일주 · 나" p={pillars.day} me />
        <PillarBox label="시주" p={pillars.time} />
      </div>

      {/* 오행 분포 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ELEMENTS.map((el) => (
          <span key={el} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <span className="h-2 w-2 rounded-full" style={{ background: EL_COLOR[el] }} />{el} {saju.elements[el] ?? 0}
          </span>
        ))}
      </div>

      {/* 오늘의 사주 풀이 */}
      <div className="mt-4">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <span className="text-violet-600 dark:text-violet-400 font-bold">{saju.dayGanKr}({saju.pillars.day.gan})</span> 일간 · 오늘의 일진{' '}
          <span className="inline-flex items-baseline">
            <ElChar hanja={saju.iljin.gan} kr={saju.iljin.ganKr} el={saju.iljin.ganEl} />
            <ElChar hanja={saju.iljin.zhi} kr={saju.iljin.zhiKr} el={ZHI_EL_OF(saju.iljin.zhi)} />
          </span>{' '}· <b>{saju.relation.key}</b>
        </div>
        <p className="mt-2 text-[15px] leading-8">{saju.reading}</p>
        {saju.readingSource === 'template' && (
          <p className="mt-2 text-xs text-gray-400">오늘 밤 더 정성 들인 풀이로 채워져요.</p>
        )}
        {!saju.hasBirthTime && (
          <p className="mt-2 text-xs text-gray-400">태어난 시를 남기면 시주까지 완성돼요. (설정에서)</p>
        )}
        <p className="mt-3 text-xs text-gray-400">표준시(KST) 기준이라 진태양시·서머타임 보정은 하지 않아요.</p>
      </div>
    </div>
  );
}
