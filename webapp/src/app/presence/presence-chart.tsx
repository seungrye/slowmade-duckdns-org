'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface DailySummary {
  date: string;
  minutes: number;
}

function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function PresenceChart({ data }: { data: DailySummary[] }) {
  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    hours: Math.round((d.minutes / 60) * 10) / 10,
    label: formatHours(d.minutes),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis unit="h" tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value, _name, props) => [props.payload.label, '재실 시간']}
        />
        <Bar dataKey="hours" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
