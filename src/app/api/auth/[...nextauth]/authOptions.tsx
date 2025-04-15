import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { connectToDB } from "@/lib/db";
import UserModel from "@/models/user";
import { Account, Profile, Session, User } from "next-auth";
import { JWT } from "next-auth/jwt";

export const authOptions = {
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
      async signIn(
        {
            user,
            account,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        profile,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        email,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        credentials,
          }: {
            user: User;
            account: Account | null;
            profile?: Profile;
            email?: string | { verificationRequest?: boolean };
            credentials?: Record<string, unknown>;
          }) {
        if (!account) {
          console.warn("account should not falsy");
          return false;
        }
  
        // console.log("signIn", user, account);
  
        await connectToDB();
  
        // 이메일을 기준으로 기존 사용자 찾기
        let existingUser = await UserModel.findOne({ email: user.email });
  
        // console.log("existingUser", existingUser);
  
        if (!existingUser) {
          // 사용자가 없으면 새로 생성
          existingUser = new UserModel({
            username: user.name,
            email: user.email,
            profileImage: user.image,
            providers: [account.provider],
          });
        } else {
          // 기존 사용자의 providers 리스트에 새 provider 추가
          if (!existingUser.providers.includes(account.provider)) {
            existingUser.providers.push(account.provider);
          }
        }
  
        // console.log("Is Mongoose Model?", existingUser instanceof mongoose.Model);
        // console.log("existingUser after", existingUser);
  
        await existingUser.save();
        return true;
      },
  
      async session({
        session,
        token,
      }: {
        session: Session;
        token: JWT;
      }) {
        // console.log("session", session, token);
  
        if (token.id && session.user) {
          session.user.id = token.id;
        }
        return session;
      },
  
      async jwt({ token, user }:
        {
            token: JWT;
            user?: User;
        }
      ) {
        // console.log("jwt", token, user);
  
        if (user) {
          token.id = user.id;
        }
        return token;
      },
    },
    pages: {
      signIn: "/login",
    },
    secret: process.env.NEXTAUTH_SECRET,
  };
  