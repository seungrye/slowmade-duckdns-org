// 구글 refresh token 보관 (#181 2단계).
//
// `auth.ts` 의 signIn 콜백이 부른다. 별도 모듈로 둔 이유는 **테스트 때문**이다 — auth.ts 를
// import 하면 NextAuth 가 초기화되어 순수 검증이 어렵다.

import GoogleOAuthToken from '@/models/google-oauth-token';
import { encryptSecret } from '@/lib/trading/crypto';

export interface OAuthAccountLike {
  provider?: string;
  refresh_token?: string | null;
  scope?: string | null;
}

/**
 * 구글이 준 refresh token 을 암호화해 보관한다.
 *
 * **올 때만 덮어쓴다.** 구글은 재로그인 때 refresh token 을 안 주는 경우가 있는데(첫 동의
 * 때만 준다), 그때 빈 값으로 덮으면 멀쩡하던 연동이 끊긴다.
 *
 * **실패는 삼킨다.** 시트 내보내기 때문에 로그인이 막히면 안 된다.
 *
 * @returns 실제로 저장했으면 true.
 */
export async function saveGoogleRefreshToken(
  email: string | null | undefined,
  account: OAuthAccountLike | null | undefined,
): Promise<boolean> {
  if (!email || account?.provider !== 'google' || !account.refresh_token) return false;
  try {
    await GoogleOAuthToken.updateOne(
      { userEmail: email },
      {
        $set: {
          refreshTokenEnc: encryptSecret(account.refresh_token),
          scope: account.scope ?? '',
          // 새로 연동했으니 예전 access token 은 버린다 — 범위가 달라졌을 수 있다.
          accessTokenEnc: '',
          expiresAt: 0,
        },
      },
      { upsert: true },
    );
    return true;
  } catch (err) {
    console.error('구글 refresh token 저장 실패(로그인은 계속합니다)', err);
    return false;
  }
}
