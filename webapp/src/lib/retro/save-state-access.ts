// 세이브스테이트 키의 접근 권한 확인 (#114).
//
// 라우트 넷이 같은 검사를 하므로 한 곳에 둔다. 형식·실재는 `parseGameKey` 가 보고,
// 여기서는 **DB 가 있어야 아는 것**(그 롬이 내 것인지)까지 마저 본다.

import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { parseGameKey } from './game-key';

/**
 * 세이브 하나의 상한 (#114).
 *
 * middleware 본문 제한(10MB) 안에 있어야 한다 — 넘기면 본문이 잘려 파싱이 깨진다.
 * 실제로는 메가드라이브 상태가 ~1MB 로 가장 크다.
 *
 * **라우트 파일이 아니라 여기 두는 이유**: Next 라우트 모듈은 HTTP 메서드와 정해진 설정만
 * export 할 수 있고, 그 밖의 export 가 있으면 프로덕션 빌드가 타입 오류로 막는다
 * (`tsc --noEmit` 만으로는 안 걸린다).
 */
export const MAX_STATE_BYTES = 8 * 1024 * 1024;

/**
 * 이 사용자가 이 게임 키를 쓸 수 있는가.
 *
 * - `builtin:` — 매니페스트에 있으면 누구나(로그인 사용자면) 쓸 수 있다
 * - `rom:` — **내가 올린 롬일 때만**. 남의 롬 키로 저장 슬롯을 만들 수 없다
 */
export async function canUseGameKey(email: string, key: string | null | undefined): Promise<boolean> {
  const parsed = parseGameKey(key);
  if (!parsed) return false;
  if (parsed.kind === 'builtin') return true;

  await connectToDB();
  const owned = await RetroRom.exists({
    _id: parsed.id,
    userEmail: email,
    isDeleted: { $ne: true },
  });
  return Boolean(owned);
}
