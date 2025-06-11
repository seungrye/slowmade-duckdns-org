"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";
import { Session } from "next-auth";

export default function MyProfile() {
    const { data: session, status }: { data: Session | null; status: string }= useSession();

    if (status === "loading") {
        return <p>Loading...</p>;
    }

    if (!session) {
        return <section className="bg-white shadow-md inset-shadow-xs rounded-lg p-6 flex items-center gap-6">
            <p className="text-center text-gray-500">로그인이 필요합니다.</p>
        </section>;
    }

    return <section className="bg-white shadow-md inset-shadow-xs rounded-lg p-6 flex items-center gap-6">
        <Image src={session?.user.image || '/user-avatar.svg' } priority alt="프로필 이미지" width={80} height={80} className="rounded-full bg-gray-300" />
        <div>
            <h2 className="text-2xl font-bold">{session?.user.name}</h2>
            <p className="text-gray-600">{session?.user.email}</p>
            <p className="text-gray-500 text-sm">가입일: {"TBD"}</p>
        </div>
        <button className="ml-auto bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
            프로필 수정
        </button>
    </section>
}