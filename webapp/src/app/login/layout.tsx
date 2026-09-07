import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    if (session) {
        redirect("/"); // Already logged in -> home
    }

    return (
        <>{children}</>
    );
}
