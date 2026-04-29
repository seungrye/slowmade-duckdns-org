import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-response';
import Presence from '@/models/presence';

function isAuthorized(req: NextRequest): boolean {
  const apiKey = process.env.PRESENCE_API_KEY;
  if (!apiKey) return false;
  const header = req.headers.get('Authorization') ?? '';
  return header === `Bearer ${apiKey}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return apiError('Unauthorized', 401);
  }

  let body: { event?: string; ssid?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid JSON', 400);
  }

  const { event, ssid = '' } = body;
  if (event !== 'enter' && event !== 'exit') {
    return apiError('event must be "enter" or "exit"', 400);
  }

  await connectToDB();

  const doc = await Presence.create({ event, ssid });
  return apiSuccess({ id: doc._id.toString() }, 201);
}

export async function GET(req: NextRequest) {
  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10), 365);
  const since = new Date();
  since.setDate(since.getDate() - days);

  await connectToDB();

  const events = await Presence.find({ timestamp: { $gte: since } })
    .sort({ timestamp: 1 })
    .lean();

  const dailySummary = computeDailySummary(events as { event: string; timestamp: Date }[]);

  return apiSuccess({ events, dailySummary });
}

function computeDailySummary(events: { event: string; timestamp: Date }[]) {
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

  // 아직 집에 있는 경우 (exit 없음)
  if (lastEnter) {
    addMinutes(minutesByDate, lastEnter, new Date());
  }

  return Object.entries(minutesByDate)
    .map(([date, minutes]) => ({ date, minutes }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function addMinutes(map: Record<string, number>, from: Date, to: Date) {
  // 날짜를 넘어가는 경우도 날짜별로 분리
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
