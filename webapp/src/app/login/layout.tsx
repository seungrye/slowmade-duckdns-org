import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    if (session) {
        redirect("/"); // 이미 로그인 되어 있으면 홈으로
    }

    return (
        <>{children}</>
    );
}
