'use client';

import { useEffect, useState } from 'react';
import { FaAward, FaLock } from 'react-icons/fa';
import { Session } from 'next-auth';
import { achievementIconMap } from '@/components/icons';
import type { AchievementView, LockedView, Tier, UnlockedView } from '@/lib/achievements';

/**
 * 내 업적 (#333).
 *
 * 예전엔 **달성한 것만** 보여줬다. 그래서 무엇을 노릴지 알 길이 없었고, 업적이 있다는 사실
 * 자체를 모르는 기능이 많았다(웹어드벤처를 405번 했는데 업적이 0개였던 것처럼).
 *
 * 이제 「도전 중」을 함께 보여준다. 진행도가 보여야 다음 목표가 생기고, 등급 색이 있어야
 * 쉬운 것과 어려운 것이 구분된다. 숨김 업적은 서버가 이미 `???` 로 가려 보낸다.
 */

const TIER_STYLE: Record<Tier, { icon: string; ring: string; label: string }> = {
  bronze: { icon: 'text-amber-700', ring: 'ring-amber-700/40', label: '동' },
  silver: { icon: 'text-gray-400', ring: 'ring-gray-400/40', label: '은' },
  gold: { icon: 'text-yellow-500', ring: 'ring-yellow-500/50', label: '금' },
};

function Icon({ name, tier, dim }: { name: string; tier: Tier; dim?: boolean }) {
  const Component = achievementIconMap[name] || FaAward;
  return (
    <div
      data-tier={tier}
      title={`${TIER_STYLE[tier].label} 등급`}
      className={`shrink-0 rounded-full p-2 ring-2 ${TIER_STYLE[tier].ring} ${
        dim ? 'text-gray-400 dark:text-gray-600' : TIER_STYLE[tier].icon
      }`}
    >
      <Component size={28} />
    </div>
  );
}

function UnlockedCard({ item }: { item: UnlockedView }) {
  return (
    <li className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-md dark:border-gray-700 dark:bg-gray-900">
      <Icon name={item.icon} tier={item.tier} />
      <div className="min-w-0">
        <h4 className="font-semibold text-gray-800 dark:text-gray-200">{item.name}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">{item.description}</p>
        {item.unlockedAt && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            달성일: {new Date(item.unlockedAt).toLocaleDateString()} · +{item.points}P
          </p>
        )}
      </div>
    </li>
  );
}

function LockedCard({ item }: { item: LockedView }) {
  const percent = item.target > 0 ? Math.round((item.current / item.target) * 100) : 0;

  return (
    <li className="flex items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      {item.hidden ? (
        <div className="shrink-0 rounded-full p-2 text-gray-400 ring-2 ring-gray-300/40 dark:text-gray-600">
          <FaLock size={28} />
        </div>
      ) : (
        <Icon name={item.icon} tier={item.tier} dim />
      )}
      <div className="min-w-0 flex-1">
        <h4 className="font-semibold text-gray-500 dark:text-gray-400">{item.name}</h4>
        {/* 숨김 업적은 설명도 진행도도 안 보여준다 — 보여주면 조건이 새어 나간다. */}
        {item.hidden ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">숨겨진 업적입니다.</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
            <div className="mt-2 flex items-center gap-2">
              <div
                role="progressbar"
                aria-label={`${item.name} 진행도`}
                aria-valuenow={item.current}
                aria-valuemin={0}
                aria-valuemax={item.target}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
              >
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {item.current} / {item.target}
              </span>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export default function MyAchievements({ session }: { session: Session | null }) {
  const [view, setView] = useState<AchievementView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    setLoading(true);
    fetch('/api/my-achievements')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(({ data }) => {
        if (!cancelled) setView(data);
      })
      .catch((error) => {
        console.error('Failed to fetch achievements', error);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) return <div className="mt-8" />;

  return (
    <section className="mt-8">
      <h3 className="text-xl font-semibold">🏆 달성한 업적 ({view?.unlocked.length ?? 0})</h3>

      {loading && <p className="mt-4 text-gray-500">업적을 불러오는 중...</p>}
      {failed && <p className="mt-4 text-gray-500">업적을 불러오지 못했습니다.</p>}

      {view && (
        <>
          {view.unlocked.length > 0 ? (
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {view.unlocked.map((item) => (
                <UnlockedCard key={item.key} item={item} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-gray-500">아직 달성한 업적이 없습니다. 아래에서 골라 보세요.</p>
          )}

          {view.locked.length > 0 && (
            <>
              <h3 className="mt-8 text-xl font-semibold">🎯 도전 중 ({view.locked.length})</h3>
              <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {view.locked.map((item) => (
                  <LockedCard key={item.key} item={item} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
