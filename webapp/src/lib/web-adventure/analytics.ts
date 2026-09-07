// The web-adventure's own Firebase Analytics helper (#245 / #273).
//
// Event prefix: adv_*
//   - adv_run_started         (character creation -> START_GAME). ability, protagonist, run_index.
//   - adv_choice_made         (sceneId, choiceId, choiceKind).
//   - adv_ending_reached      (ending_id, run_index, protagonist, stigma_erosion).
//   - adv_petrification_auto  (reaching 100 automatically - protagonist, run_index). #273
//   - adv_stigma_critical     (first reaching contamination 80 - protagonist, run_index, stigma_erosion). #273
//   - adv_world_flag_applied  (a run where a boomerang flag actually applied - flags, run_index). #273
//   - adv_save_persisted      (a successful server autosave - scene_id, run_index). #273
//   - adv_gallery_view        (a visit to the gallery page).
//
// SSR-safe (guarded on window). Skipped without a measurement id.

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
