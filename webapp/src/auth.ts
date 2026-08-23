import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { connectToDB } from "@/lib/db";
import UserModel from "@/models/user";
import { env } from "@/lib/env";

// 구글 시트 내보내기(#181)가 제거되면서 `drive.file` 범위와 refresh token 저장도 함께
// 걷어냈다 (#228). 그 분기는 `GOOGLE_SHEETS_EXPORT` 가 켜져야 동작했는데 한 번도 켜진 적이
// 없어, 로그인은 처음부터 기본 범위로만 돌고 있었다 — 즉 동작이 바뀌지 않는다.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
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
