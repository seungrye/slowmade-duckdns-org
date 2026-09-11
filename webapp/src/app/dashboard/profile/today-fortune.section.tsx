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

type Pillar = { ganzhi: string; gan: string; zhi: string; ganKr: string; zhiKr: string; ganEl: WuXing; zhiEl: WuXing };
type SajuBlock = {
 pillars: { year: Pillar; month: Pillar; day: Pillar; time: Pillar | null };
 dayGanKr: string; dayEl: WuXing; elements: Record<WuXing, number>;
 iljin: { ganzhi: string; gan: string; zhi: string; ganKr: string; zhiKr: string; ganEl: WuXing; zhiEl: WuXing };
 /** 오행 저울 — 타고난 몫 위에 오늘이 얹힌 상태 (#449). 서버가 계산해 준다. */
 bars: Record<WuXing, { base: number; add: number; total: number }>;
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

import { EL_VAR, ELEMENTS, meaningOf, type WuXing } from '@/lib/fortune/saju-labels';
// 사주 글자 수 — 시주가 있으면 4기둥×2=8, 없으면 3기둥×2=6.
const sajuTotal = (saju: SajuBlock) => (saju.pillars.time ? 8 : 6);

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
 <span className="text-accent">✦</span> 오늘의 운세
 {data && <span className="text-sm font-normal text-gray-400 tabular-nums">· {data.dateKey}</span>}
 </h2>

 <div className="rounded-lg border border-accent-line bg-white dark:bg-gray-800 p-5 shadow-sm">
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
 ? 'border-accent-line text-accent dark:border-accent-line '
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
 <div className="absolute inset-0 grid place-items-center gap-2 rounded-xl border border-accent-line bg-gray-50 dark:bg-gray-900 [backface-visibility:hidden]">
 <div className="grid aspect-square w-[56%] place-items-center rounded-lg border-[1.5px] border-accent-line text-accent">
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
 <div className="text-xs font-semibold tracking-wide text-accent">{data.card.nameEn}</div>
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
 카드를 <b className="text-accent">뒤집어</b> 오늘의 메시지를 확인하세요.
 </p>
 ) : (
 <div>
 <div className="text-xs font-semibold tracking-wide text-accent">{data.card.nameEn}</div>
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
 <span style={{ color: EL_VAR[el as WuXing] }} className="font-bold">{hanja}</span>
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
 (me ? 'border-accent-line bg-accent/10' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900')
 }>
 <div className={'text-[10px] ' + (me ? 'font-semibold text-accent' : 'text-gray-400')}>{label}</div>
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
 <b className="text-accent">생년월일</b>을 남기면 오늘의 사주 운세가 열려요.
 </p>
 <a href="#birthday-card" className="mt-3 inline-block rounded-lg border border-accent-line px-4 py-2 text-sm font-semibold text-accent hover:border-accent-line ">
 생일 등록하러 가기 ↑
 </a>
 </div>
 );
 }
 const { pillars, bars } = saju;
 // 저울 눈금 — 오늘 얹은 것까지 담아야 막대가 안 잘린다.
 const scale = Math.max(1, ...ELEMENTS.map((el) => bars?.[el]?.total ?? 0));
 return (
 <div>
 {/* ── 오늘 ─────────────────────────────────────────────────
 매일 바뀌는 것만 보라 테두리 안에 모은다 (#449). 예전엔 이 자리에 평생 안 바뀌는
 사주판이 있었고 오늘은 맨 아래 12px 한 줄이었다 — 그래서 "매일 같은 값"으로 읽혔다.

 카드와 저울은 같은 것을 두 번 말한다: 카드의 두 글자가 곧 저울에 얹히는 두 기운
 이고, 글자 색과 빗금 색이 같다. 색이 곧 범례라 설명이 따로 필요 없다. */}
 <div className="rounded-xl border-2 border-accent-line p-3">
 <div className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[112px_200px_minmax(0,1fr)] sm:items-start">
 {/* 오늘의 일진 카드 — 타로 카드와 같은 비율 */}
 <div
 className="grid aspect-[60/103] place-content-center rounded-xl border-2 border-accent-line text-center"
 style={{
 // 변수에는 hex 알파(`#rrggbb22`)를 못 붙인다 — color-mix 로 옅게 한다.
 background: `linear-gradient(160deg,
 color-mix(in srgb, ${EL_VAR[saju.iljin.ganEl]} 14%, transparent),
 color-mix(in srgb, ${EL_VAR[saju.iljin.zhiEl]} 10%, transparent))`,
 }}
 aria-label={`오늘의 일진 ${saju.iljin.ganKr}${saju.iljin.zhiKr}, ${saju.relation.key}`}
 >
 <div className="text-[34px] font-black leading-none" style={{ color: EL_VAR[saju.iljin.ganEl] }}>
 {saju.iljin.gan}
 </div>
 <div className="text-[34px] font-black leading-none" style={{ color: EL_VAR[saju.iljin.zhiEl] }}>
 {saju.iljin.zhi}
 </div>
 <div className="mt-1.5 text-[11.5px] text-gray-500 dark:text-gray-400">
 {saju.iljin.ganKr}{saju.iljin.zhiKr}
 </div>
 <div className="mt-1.5 justify-self-center rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-white">
 {saju.relation.key}
 </div>
 </div>

 {/* 오행 저울 — 본체는 고정, 빗금만 오늘 */}
 <div>
 <div className="grid gap-1.5">
 {ELEMENTS.map((el) => {
 const b = bars?.[el] ?? { base: saju.elements[el] ?? 0, add: 0, total: saju.elements[el] ?? 0 };
 const pc = (n: number) => `${(n / scale) * 100}%`;
 return (
 <div key={el} className="grid grid-cols-[16px_1fr_auto] items-center gap-1.5 text-[11.5px]">
 <span style={{ color: EL_VAR[el] }}>{el}</span>
 <span className="flex h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
 <i className="h-full" style={{ width: pc(b.base), background: EL_VAR[el] }} />
 {b.add > 0 && (
 <i
 className="h-full opacity-60"
 style={{
 width: pc(b.add),
 color: EL_VAR[el],
 backgroundImage:
 'repeating-linear-gradient(45deg, currentColor 0 3px, transparent 3px 6px)',
 }}
 />
 )}
 </span>
 <span className="font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
 {b.add > 0 ? <>{b.base}<b className="text-gray-800 dark:text-gray-100">→{b.total}</b></> : b.base}
 </span>
 </div>
 );
 })}
 </div>
 {/* 이건 비유다 — 일진을 원국에 산술로 더하는 건 명리학의 계산이 아니다. */}
 <p className="mt-2 text-[10.5px] text-gray-400">빗금 = 오늘 더해지는 기운(비유)</p>
 </div>

 {/* 풀이 — 좁은 화면에선 아래 전폭으로 내려간다.
 카드 옆 한 칸에 같이 넣으면 폭이 190px 라 한 줄 13자가 된다(실측). */}
 <p className="col-span-2 mt-1 text-[15px] leading-8 sm:col-span-1 sm:mt-0">{saju.reading}</p>
 </div>
 {saju.readingSource === 'template' && (
 <p className="mt-2 text-xs text-gray-400">오늘 밤 더 정성 들인 풀이로 채워져요.</p>
 )}
 </div>

 {/* ── 태어날 때 정해진 것 ───────────────────────────────────
 지우지 않는다. 접어 둘 뿐이고 펼치면 예전 그대로다. */}
 <details className="group mt-4 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
 <summary className="cursor-pointer list-none px-3 py-2.5 text-[12.5px] text-gray-500 marker:content-none dark:text-gray-400">
 <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">▸</span>
 내 사주 여덟 글자 · 오행 분포
 <span className="ml-1.5 text-gray-400">— 태어날 때 정해진 값</span>
 </summary>
 <div className="px-3 pb-3">
 <div className="grid grid-cols-4 gap-2">
 <PillarBox label="년주" p={pillars.year} />
 <PillarBox label="월주" p={pillars.month} />
 <PillarBox label="일주 · 나" p={pillars.day} me />
 <PillarBox label="시주" p={pillars.time} />
 </div>
 <div className="mt-4 flex items-center gap-1.5">
 <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">오행 분포</span>
 <span className="group/oh relative inline-flex cursor-help text-gray-400" tabIndex={0} aria-label="오행 분포란">
 <span className="grid h-4 w-4 place-items-center rounded-full border border-gray-300 text-[10px] dark:border-gray-600">?</span>
 <span
 role="tooltip"
 className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 w-max max-w-[240px] rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-gray-50 opacity-0 shadow-lg transition-opacity group-hover/oh:opacity-100 group-focus/oh:opacity-100 dark:bg-gray-700"
 >
 사주 {sajuTotal(saju)}글자 중 각 오행이 몇 개인지예요. 많거나 없는 기운이 그 사람의 균형을 말해 줍니다.
 </span>
 </span>
 </div>
 <div className="mt-1.5 flex flex-wrap gap-1.5">
 {ELEMENTS.map((el) => {
 const n = saju.elements[el] ?? 0;
 return (
 <span
 key={el}
 tabIndex={0}
 className="group/chip relative inline-flex cursor-help items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
 >
 <span className="h-2 w-2 rounded-full" style={{ background: EL_VAR[el] }} />{el} {n}
 <span
 role="tooltip"
 className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 w-max max-w-[220px] -translate-x-1/2 rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-gray-50 opacity-0 shadow-lg transition-opacity group-hover/chip:opacity-100 group-focus/chip:opacity-100 dark:bg-gray-700"
 >
 사주 {sajuTotal(saju)}글자 중 {el} 기운이 {n}개{n === 0 ? ' — 이 기운은 없어요' : ''}
 </span>
 </span>
 );
 })}
 </div>
 <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
 <span className="font-bold text-accent">{saju.dayGanKr}({saju.pillars.day.gan})</span> 일간 — 나의 기운은 {saju.dayEl}
 </div>
 {!saju.hasBirthTime && (
 <p className="mt-2 text-xs text-gray-400">태어난 시를 남기면 시주까지 완성돼요. (설정에서)</p>
 )}
 <p className="mt-3 text-xs text-gray-400">표준시(KST) 기준이라 진태양시·서머타임 보정은 하지 않아요.</p>
 </div>
 </details>
 </div>
 );
}
