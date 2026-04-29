import { NextResponse } from 'next/server';

export function apiSuccess<T>(data: T, status = 200, message?: string): NextResponse {
  const body = message !== undefined
    ? { success: true, data, message }
    : { success: true, data };
  return NextResponse.json(body, { status });
}

export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ success: false, message }, { status });
}
