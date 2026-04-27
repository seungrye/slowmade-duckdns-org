import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { connectToDB } from "@/lib/db";
import UserModel from "@/models/user";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
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
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
});
