// 구글 access token 확보 (#181 2단계).
//
// 로그인 때 받아 둔 refresh token(암호화 저장)으로 access token 을 만들어 준다.
// access token 은 한 시간이면 죽으므로, 살아 있으면 재사용하고 아니면 갱신해 다시 저장한다.
//
// **실패는 던지지 않고 `null` 로 돌려준다.** 구글 쪽 사정으로 매매 화면이 죽으면 안 된다 —
// 호출측이 "다시 로그인해 동의해 주세요"로 안내하면 그만이다.

import { connectToDB } from '@/lib/db';
import GoogleOAuthToken from '@/models/google-oauth-token';
import { decryptSecret, encryptSecret } from '@/lib/trading/crypto';
import { env } from '@/lib/env';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * 만료 여유. 남은 시간이 이보다 적으면 미리 갱신한다 — 요청이 오가는 사이에 죽으면
 * 원인을 찾기 어려운 401 이 된다.
 */
const EARLY_REFRESH_MS = 60_000;

export async function getAccessToken(userEmail: string): Promise<string | null> {
  await connectToDB();
  const doc = await GoogleOAuthToken.findOne({ userEmail }).lean();
  if (!doc?.refreshTokenEnc) return null; // 아직 연동한 적이 없다

  const now = Date.now();
  if (doc.accessTokenEnc && doc.expiresAt && doc.expiresAt - now > EARLY_REFRESH_MS) {
    try {
      return decryptSecret(doc.accessTokenEnc);
    } catch {
      // 키가 바뀌었거나 값이 깨졌다 — 아래에서 새로 받는다.
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(doc.refreshTokenEnc);
  } catch (err) {
    console.error('구글 refresh token 복호 실패 — 재로그인이 필요합니다.', err);
    return null;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) {
      // invalid_grant = 사용자가 동의를 철회했거나 토큰이 폐기됐다. 재로그인 말고는 답이 없다.
      console.error('구글 토큰 갱신 실패', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    await GoogleOAuthToken.updateOne(
      { userEmail },
      {
        $set: {
          accessTokenEnc: encryptSecret(json.access_token),
          expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
        },
      },
    );
    return json.access_token;
  } catch (err) {
    console.error('구글 토큰 갱신 중 오류', err);
    return null;
  }
}
