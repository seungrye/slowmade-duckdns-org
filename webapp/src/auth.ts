import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { connectToDB } from "@/lib/db";
import UserModel from "@/models/user";
import { saveGoogleRefreshToken } from "@/lib/google/refresh-token-store";
import { env } from "@/lib/env";

/**
 * 매매기록을 구글 시트로 내보내려면 구글 API 를 부를 수 있어야 한다 (#181).
 *
 * `drive.file` 은 **앱이 만든 파일만** 다루는 비민감 범위다 — 사용자의 기존 드라이브에는
 * 손대지 못하고, 그래서 구글 검증 심사도 없다.
 *
 * `prompt: consent` 를 강제하는 이유: 구글은 **첫 동의 때만** refresh token 을 준다.
 * 강제하지 않으면 이미 동의한 계정에서 토큰이 오지 않아 기능이 조용히 죽는다.
 *
 * **플래그가 꺼져 있으면 아무것도 얹지 않는다** — 로그인 동작이 종전과 완전히 같다.
 * GCP 쪽 준비(Sheets·Drive API 사용 설정, 동의 화면 범위 추가)가 끝나기 전에 켜면
 * 로그인이 막혀 관리자 화면에 못 들어간다.
 */
const googleAuthorization = env.google.sheetsExport
  ? {
      params: {
        scope: "openid email profile https://www.googleapis.com/auth/drive.file",
        access_type: "offline",
        prompt: "consent",
      },
    }
  : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
      authorization: googleAuthorization,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account) {
        console.warn("account should not falsy");
        return false;
      }

      await connectToDB();

      let existingUser = await UserModel.findOne({ email: user.email });

      if (!existingUser) {
        existingUser = new UserModel({
          username: user.name,
          email: user.email,
          profileImage: user.image,
          providers: [account.provider],
        });
      } else {
        if (!existingUser.providers.includes(account.provider)) {
          existingUser.providers.push(account.provider);
        }
      }

      await existingUser.save();
      await saveGoogleRefreshToken(user.email, account);
      return true;
    },

    async session({ session, token }) {
      const secret = (token as Record<string, unknown>).secret;
      if (secret && session.user) {
        session.user.token = secret as string;
      }
      // owner 플래그 — UI 메뉴 노출용. server 측 가드는 항상 requireOwner 로 재검증.
      if (session.user?.email && env.ownerEmail) {
        session.user.isOwner = session.user.email === env.ownerEmail;
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) {
        (token as Record<string, unknown>).secret = (user as { token?: string }).token;
      }
      return token;
    },
  },
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
});
