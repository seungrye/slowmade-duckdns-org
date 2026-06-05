// useMigrateOnLogin — 로그인 직후 localStorage 의 save/past_runs 를 서버로 이전 (#240).
//
// session.status==='authenticated' 가 되는 순간 (= 로그인 직후)
//   - localStorage 의 save / past_runs 확인.
//   - 둘 다 없으면 skip.
//   - 있으면 POST /api/web-adventure/migrate-from-local (기본 mode='keep').
//   - 응답 migrated:true 면 localStorage 의 이전 데이터 정리.
//   - migrated:false (reason:'server_exists') 면 그대로 유지 (사용자가 별도 force 결정).
// 이 훅은 *세션당 1 회만* 실행되도록 ref 가드.

'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { LOCAL_STORAGE_KEY } from './use-auto-save';

export const LOCAL_STORAGE_PAST_RUNS_KEY = 'web-adventure:past-runs:v1';

const API_URL = '/api/web-adventure/migrate-from-local';

interface MigrateResponse {
  migrated: boolean;
  reason?: string;
  pastRunsMigrated?: number;
}

function readJSON<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function useMigrateOnLogin(): void {
  const { status } = useSession();
  const ranRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (ranRef.current) return;
    ranRef.current = true;

    const save = readJSON(LOCAL_STORAGE_KEY);
    const pastRuns = readJSON<unknown[]>(LOCAL_STORAGE_PAST_RUNS_KEY);
    if (!save && (!pastRuns || pastRuns.length === 0)) return;

    void fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ save, pastRuns }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as { data?: MigrateResponse };
        if (json?.data?.migrated) {
          try {
            window.localStorage.removeItem(LOCAL_STORAGE_KEY);
            window.localStorage.removeItem(LOCAL_STORAGE_PAST_RUNS_KEY);
          } catch {
            /* private 모드 등 — 무시 */
          }
        }
      })
      .catch(() => {
        /* 네트워크 실패 — 다음 세션에서 재시도 (ranRef 가 mount 별이라 새 페이지 진입 시 재시도) */
      });
  }, [status]);
}
