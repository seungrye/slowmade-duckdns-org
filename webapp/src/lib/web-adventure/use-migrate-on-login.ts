// useMigrateOnLogin - moving localStorage's save and past_runs to the server right after login (#240).
//
// The moment session.status becomes 'authenticated' (= right after login):
//   - it checks localStorage's save and past_runs.
//   - with neither, it is skipped.
//   - with either, it POSTs /api/web-adventure/migrate-from-local (mode='keep' by default).
//   - on migrated:true it clears the migrated data from localStorage.
//   - on migrated:false (reason:'server_exists') it is left alone (the user decides separately whether to force).
// A ref guard makes this hook run *only once per session*.

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
