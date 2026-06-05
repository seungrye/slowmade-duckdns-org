// web-adventure 전용 Firebase Analytics 헬퍼 (#245).
//
// 이벤트 prefix: adv_*
//   - adv_run_started      (캐릭터 생성 → START_GAME)
//   - adv_choice_made      (sceneId, choiceId, choiceKind)
//   - adv_ending_reached   (endingId, runIndex)
//   - adv_save_persisted   (save 자동 저장 시)
//   - adv_gallery_view     (갤러리 페이지 방문)
//
// SSR 안전 (window guard). measurement id 없으면 skip.

import { getFirebaseAnalytics } from '@/lib/firebase';
import { logEvent } from 'firebase/analytics';

export function logAdvEvent(name: string, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  if (!process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return;
  getFirebaseAnalytics().then((analytics) => {
    if (!analytics) return;
    logEvent(analytics, `adv_${name}`, params);
  }).catch(() => {
    /* analytics 초기화 실패 — silent */
  });
}
