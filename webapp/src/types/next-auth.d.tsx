import { DefaultSession } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            token: string;
            isOwner?: boolean;
        } & DefaultSession["user"];
    }

    interface User {
        token?: string;
    }
}

