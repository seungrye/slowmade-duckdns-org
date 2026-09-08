import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { connectToDB } from "@/lib/db";
import UserModel from "@/models/user";
import { env } from "@/lib/env";

// When the Google Sheets export (#181) was removed, the `drive.file` scope and the stored refresh token went
// with it (#228). That branch only ran with `GOOGLE_SHEETS_EXPORT` on, and it was never on,
// so login had always run on the default scopes alone - that is, the behaviour does not change.
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
      // The owner flag - for showing the UI menu. Server-side guards always re-check with requireOwner.
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
