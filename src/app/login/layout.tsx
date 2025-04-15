import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../api/auth/[...nextauth]/authOptions";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(authOptions);
    if (session) {
        redirect("/"); // 이미 로그인 되어 있으면 홈으로
    }

    return (
        <>{children}</>
    );
}
