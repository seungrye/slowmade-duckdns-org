import { NextRequest } from 'next/server';
import { connectToDB } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/api-response';
import { auth } from '@/auth';
import Presence from '@/models/presence';
import User from '@/models/user';

async function getUserEmailByToken(token: string): Promise<string | null> {
  const user = await User.findOne({ presenceToken: token }).select('email').lean();
  return (user as { email?: string } | null)?.email ?? null;
}

function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req);
  if (!token) return apiError('Unauthorized', 401);

  await connectToDB();

  const userEmail = await getUserEmailByToken(token);
  if (!userEmail) return apiError('Unauthorized', 401);

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

  const doc = await Presence.create({ event, ssid, userEmail });
  return apiSuccess({ id: doc._id.toString() }, 201);
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return apiError('Unauthorized', 401);

  const days = Math.min(parseInt(_req.nextUrl.searchParams.get('days') ?? '30', 10), 365);
  const since = new Date();
  since.setDate(since.getDate() - days);

  await connectToDB();

  const events = await Presence.find({
    userEmail: session.user.email,
    timestamp: { $gte: since },
  })
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
