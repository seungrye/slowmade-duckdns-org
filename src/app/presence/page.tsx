import { connectToDB } from '@/lib/db';
import Presence from '@/models/presence';
import PresenceChart from './presence-chart';

interface DailySummary {
  date: string;
  minutes: number;
}

function computeDailySummary(events: { event: string; timestamp: Date }[]): DailySummary[] {
  const minutesByDate: Record<string, number> = {};
  let lastEnter: Date | null = null;

  for (const e of events) {
    const ts = new Date(e.timestamp);
    if (e.event === 'enter') {
      lastEnter = ts;
    } else if (e.event === 'exit' && lastEnter) {
      addMinutes(minutesByDate, lastEnter, ts);
      lastEnter = null;
    }
  }

  if (lastEnter) addMinutes(minutesByDate, lastEnter, new Date());

  return Object.entries(minutesByDate)
    .map(([date, minutes]) => ({ date, minutes }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function addMinutes(map: Record<string, number>, from: Date, to: Date) {
  const cursor = new Date(from);
  while (cursor < to) {
    const dateKey = cursor.toISOString().slice(0, 10);
    const endOfDay = new Date(cursor);
    endOfDay.setHours(23, 59, 59, 999);
    const segmentEnd = to < endOfDay ? to : endOfDay;
    const minutes = Math.round((segmentEnd.getTime() - cursor.getTime()) / 60000);
    map[dateKey] = (map[dateKey] ?? 0) + minutes;
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
}

export default async function PresencePage() {
  await connectToDB();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const events = await Presence.find({ timestamp: { $gte: since } })
    .sort({ timestamp: 1 })
    .lean();

  const dailySummary = computeDailySummary(
    events as { event: string; timestamp: Date }[]
  );

  const recentEvents = [...events].reverse().slice(0, 20);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-xl font-bold">재실 현황 (최근 30일)</h1>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">일별 재실 시간</h2>
        {dailySummary.length === 0 ? (
          <p className="text-sm text-gray-400">데이터가 없습니다.</p>
        ) : (
          <PresenceChart data={dailySummary} />
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">최근 입/출 기록</h2>
        <ul className="space-y-1 text-sm">
          {recentEvents.length === 0 && (
            <li className="text-gray-400">기록이 없습니다.</li>
          )}
          {recentEvents.map((e) => {
            const ts = new Date(e.timestamp as Date);
            return (
              <li key={e._id.toString()} className="flex items-center gap-3">
                <span className={e.event === 'enter' ? 'text-green-500' : 'text-red-400'}>
                  {e.event === 'enter' ? '입실' : '퇴실'}
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                  {ts.toLocaleDateString('ko-KR')} {ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {e.ssid && (
                  <span className="text-gray-400 text-xs">{e.ssid as string}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
