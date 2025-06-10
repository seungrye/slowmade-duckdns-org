// eslint-disable-next-line @typescript-eslint/no-unused-vars
import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            token: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
        } & DefaultSession["user"];
    }

    interface User {
        token: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        secret: string;
    }
}
