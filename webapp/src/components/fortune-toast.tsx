'use client';

/**
 * The daily fortune toast (#388) - a tarot card in the bottom right on the day's first visit.
 *
 * The trigger mirrors birthday-fireworks, but the once-a-day check uses **the server's seenAt**
 * (not localStorage - the user decided on a server field). While logged in, it appears when today's document has seen
 * false, and clicking it takes you to the profile's 'today's fortune' and records seen.
 *
 * Being an overlay like the fireworks, it mounts as their sibling in providers. On the profile page the section is
 * already visible, so no toast is shown (it would duplicate).
 */
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';

export default function FortuneToast() {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    // The profile page already has the section, so the toast is skipped.
    if (pathname?.startsWith('/dashboard/profile')) return;
    let cancelled = false;
    fetch('/api/fortune/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const seen = res?.data?.seen;
        if (!cancelled && res?.data && !seen) {
          // It appears slightly late (once the page has settled).
          setTimeout(() => { if (!cancelled) setShow(true); }, 1000);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status, pathname]);

  const markSeen = () => { fetch('/api/fortune/seen', { method: 'POST' }).catch(() => {}); };

  const dismiss = () => {
    setLeaving(true);
    markSeen();
    setTimeout(() => setShow(false), 300);
  };

  const open = () => {
    markSeen();
    setLeaving(true);
    setTimeout(() => setShow(false), 300);
    router.push('/dashboard/profile#today-fortune');
  };

  if (!show) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="오늘의 카드 보기"
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      className={
        'fixed bottom-5 right-5 z-[60] flex w-[210px] cursor-pointer items-center gap-3 rounded-2xl ' +
        'border border-gray-200 bg-white p-3 shadow-xl transition-all duration-300 dark:border-gray-700 dark:bg-gray-800 ' +
        'hover:border-violet-300 dark:hover:border-violet-700 ' +
        (leaving ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100')
      }
      style={{ animation: leaving ? undefined : 'fortune-rise .5s cubic-bezier(.2,.9,.2,1)' }}
    >
      <div className="grid h-[75px] w-[44px] flex-none place-items-center rounded-md border border-violet-500 bg-gray-50 text-violet-600 dark:bg-gray-900 dark:text-violet-400">
        <span className="text-xl">✦</span>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold tracking-wide text-violet-600 dark:text-violet-400">오늘의 카드</div>
        <div className="mt-0.5 text-sm font-semibold">도착했어요</div>
        <div className="mt-0.5 text-[11.5px] text-gray-500 dark:text-gray-400">눌러서 뒤집어 보기</div>
      </div>
      <button
        type="button"
        aria-label="닫기"
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        className="absolute right-2 top-1.5 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        ✕
      </button>
      <style>{`@keyframes fortune-rise{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
        @media (prefers-reduced-motion: reduce){[aria-label="오늘의 카드 보기"]{animation:none!important}}`}</style>
    </div>
  );
}
