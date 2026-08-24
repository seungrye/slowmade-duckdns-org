// 읽음 처리를 화면이 바로 따라가게 (#259).
//
// 벨(navbar)과 알림 목록(페이지)은 **다른 트리**에 있고 서로를 모른다. 게다가 벨은 화면을
// 옮겨도 다시 마운트되지 않아서, 알림을 눌러 읽음 처리를 해도 숫자가 그대로였다.
// 실측(스테이징):
//
//   목록 진입      배지 4 · 안읽음 4
//   클릭 후        배지 4        ← 서버는 이미 3
//   [모두 읽음]    목록 0 인데 배지 3 그대로
//
// 상태를 위로 끌어올리려면 navbar 부터 페이지까지 감싸는 provider 가 필요한데, 숫자 하나
// 때문에 트리를 다시 짤 일이 아니다. **브라우저 이벤트로 알린다** — 보내는 쪽도 듣는 쪽도
// 서로를 import 하지 않는다.
//
// 서버 응답을 기다리지 않고 **누르는 즉시** 보낸다. 눈에 보이는 반응이 목적이고, 어긋나더라도
// 다음 조회에서 서버 값으로 맞춰진다.

/** 알림 하나를 읽었다. */
export const NOTIFICATION_READ = 'notification:read';

/** 전부 읽음으로 표시했다. */
export const NOTIFICATIONS_ALL_READ = 'notification:all-read';

function emit(name: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name));
}

/**
 * 목록을 다시 받아와야 하는가 (#259).
 *
 * 알림을 누르면 곧바로 글 화면으로 넘어간다. 그 순간 `router.refresh()` 를 불러도 이동에
 * 밀려 먹지 않는다 — 실측에서 **뒤로 갔을 때 안읽음이 4건 그대로** 나왔다(서버는 3).
 * 그래서 "바뀌었다"는 사실만 남겨 두고, 목록으로 **돌아왔을 때** 그때 다시 받아온다.
 *
 * 모듈 변수라 클라이언트 이동 사이에는 유지되고, 새로고침하면 사라진다 — 새로고침은 어차피
 * 최신을 받아오므로 그래도 된다.
 */
let dirty = false;

export function emitNotificationRead(): void {
  dirty = true;
  emit(NOTIFICATION_READ);
}

/** 다시 받아와야 하면 true 를 주고 표시를 지운다 — 한 번만 갱신하게. */
export function consumeNotificationsDirty(): boolean {
  const was = dirty;
  dirty = false;
  return was;
}

export function emitNotificationsAllRead(): void {
  emit(NOTIFICATIONS_ALL_READ);
}

/**
 * 하나 읽었을 때의 새 숫자.
 *
 * 화면 값과 서버 값이 어긋나 있을 수 있다 — 음수 뱃지를 보여 주느니 0 에서 멈춘다.
 */
export function decrementUnread(count: number): number {
  return Math.max(0, count - 1);
}
