"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Session } from "next-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBirthdayInput } from "@/lib/birthday";
import { clearBirthdayMarkers } from "@/components/birthday-fireworks";

type UserProfile = {
    name: string;
    email: string;
    image: string;
    points: number;
    createdAt: string;
    birthday?: string | null;
};

export default function MyProfile({session}: { session: Session | null }) {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [birthday, setBirthday] = useState('');
    const [birthTime, setBirthTime] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            if (!session) return;
            try {
                setLoading(true);
                const res = await fetch('/api/user/profile');
                if (res.ok) {
                    const { data } = await res.json();
                    setProfile(data);
                    setBirthday(formatBirthdayInput(data?.birthday ? new Date(data.birthday) : null));
                    setBirthTime(typeof data?.birthTime === 'string' ? data.birthTime : '');
                }
            } catch (error) {
                console.error("Failed to fetch profile", error);
            } finally {
                setLoading(false);
            }
        };
        if(session) fetchProfile();
    }, [session]);

    // 생일을 저장하면 표식을 지운다 — 오늘이 생일인데 방금 등록한 경우 바로 폭죽이 터지도록.
    const saveBirthday = async () => {
        setSaving(true);
        setMessage('');
        try {
            const res = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ birthday: birthday || null, birthTime: birthTime || null }),
            });
            const body = await res.json();
            if (!res.ok) {
                setMessage(body?.message || '저장에 실패했습니다.');
                return;
            }
            clearBirthdayMarkers();
            setMessage(birthday ? '저장했습니다.' : '생일을 지웠습니다.');
        } catch {
            setMessage('저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (!session) {
        return (
            <Card className="flex items-center gap-6">
                <p className="text-center text-gray-500">로그인이 필요합니다.</p>
            </Card>
        );
    }

    return (
        <>
            <Card className="flex items-center gap-6">
                <Image
                    src={profile?.image || session?.user.image || '/user-avatar.svg'}
                    priority
                    alt="프로필 이미지"
                    width={80}
                    height={80}
                    className="rounded-full bg-gray-300 dark:bg-gray-600"
                />
                <div>
                    <h2 className="text-2xl font-bold">{profile?.name || session?.user.name}</h2>
                    <p className="text-gray-600 dark:text-gray-400">{profile?.email || session?.user.email}</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                        {loading ? '로딩 중...' : `포인트: ${profile?.points?.toLocaleString() || 0} P | 가입일: ${profile ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}`}
                    </p>
                </div>
                <Button variant="secondary" className="ml-auto" aria-label="프로필 수정">
                    프로필 수정
                </Button>
            </Card>

            <Card className="mt-4" id="birthday-card">
                <h3 className="text-lg font-semibold">생일</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    등록해 두면 생일 당일 처음 접속할 때 축하 폭죽이 터지고, <b className="text-violet-600 dark:text-violet-400">오늘의 사주 운세</b>가 열립니다. 비워 두고 저장하면 지워집니다.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label htmlFor="birthday" className="sr-only">생일</label>
                    <input
                        id="birthday"
                        type="date"
                        value={birthday}
                        max={formatBirthdayInput(new Date())}
                        onChange={(e) => { setBirthday(e.target.value); setMessage(''); }}
                        disabled={loading || saving}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    <label htmlFor="birthTime" className="text-sm text-gray-500 dark:text-gray-400">태어난 시</label>
                    <input
                        id="birthTime"
                        type="time"
                        value={birthTime}
                        onChange={(e) => { setBirthTime(e.target.value); setMessage(''); }}
                        disabled={loading || saving}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    <Button onClick={saveBirthday} disabled={loading || saving}>
                        {saving ? '저장 중...' : '저장'}
                    </Button>
                    {message && (
                        <span className="text-sm text-gray-600 dark:text-gray-400" role="status">{message}</span>
                    )}
                </div>
                <p className="text-xs text-gray-400 mt-2">태어난 시를 모르면 비워 두세요 — 사주 시주(時柱)만 생략됩니다.</p>
            </Card>
        </>
    );
}
