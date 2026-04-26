"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Session } from "next-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type UserProfile = {
    name: string;
    email: string;
    image: string;
    points: number;
    createdAt: string;
};

export default function MyProfile({session}: { session: Session | null }) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!session) return;
            try {
                setLoading(true);
                const res = await fetch('/api/user/profile');
                if (res.ok) {
                    const data = await res.json();
                    setProfile(data);
                }
            } catch (error) {
                console.error("Failed to fetch profile", error);
            } finally {
                setLoading(false);
            }
        };
        if(session) fetchProfile();
    }, [session]);

    if (!session) {
        return (
            <Card className="flex items-center gap-6">
                <p className="text-center text-gray-500">로그인이 필요합니다.</p>
            </Card>
        );
    }

    return (
        <Card className="flex items-center gap-6">
            <Image
                src={profile?.image || session?.user.image || '/user-avatar.svg'}
                priority
                alt="프로필 이미지"
                width={80}
                height={80}
                className="rounded-full bg-gray-300"
            />
            <div>
                <h2 className="text-2xl font-bold">{profile?.name || session?.user.name}</h2>
                <p className="text-gray-600">{profile?.email || session?.user.email}</p>
                <p className="text-gray-500 text-sm mt-1">
                    {loading ? '로딩 중...' : `포인트: ${profile?.points?.toLocaleString() || 0} P | 가입일: ${profile ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}`}
                </p>
            </div>
            <Button variant="secondary" className="ml-auto" aria-label="프로필 수정">
                프로필 수정
            </Button>
        </Card>
    );
}
