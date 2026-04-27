import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            token: string;
        } & DefaultSession["user"];
    }

    interface User {
        token?: string;
    }
}

