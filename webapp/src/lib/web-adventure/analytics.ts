// web-adventure 전용 Firebase Analytics 헬퍼 (#245 / #273).
//
// 이벤트 prefix: adv_*
//   - adv_run_started         (캐릭터 생성 → START_GAME). ability, protagonist, run_index.
//   - adv_choice_made         (sceneId, choiceId, choiceKind).
//   - adv_ending_reached      (ending_id, run_index, protagonist, stigma_erosion).
//   - adv_petrification_auto  (자동 100 도달 — protagonist, run_index). #273
//   - adv_stigma_critical     (침식 80 첫 도달 — protagonist, run_index, stigma_erosion). #273
//   - adv_world_flag_applied  (회차 부메랑 flag 가 실 적용된 회차 — flags, run_index). #273
//   - adv_save_persisted      (서버 자동 저장 성공 — scene_id, run_index). #273
//   - adv_gallery_view        (갤러리 페이지 방문).
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
