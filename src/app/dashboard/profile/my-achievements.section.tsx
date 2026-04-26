'use client';

import { UserAchievementType } from "../../../types/achievements.d";
import { useEffect, useState } from "react";
import { FaAward } from "react-icons/fa";
import { achievementIconMap } from "../../../components/icons";
import { Session } from "next-auth";

export default function MyAchievements({ session }: { session: Session | null }) {
    const [achievements, setAchievements] = useState<UserAchievementType[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAchievements = async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/my-achievements');
                if (res.ok) {
                    const data = await res.json();
                    setAchievements(data);
                }
            } catch (error) {
                console.error("Failed to fetch achievements", error);
            } finally {
                setLoading(false);
            }
        };

        if (session) fetchAchievements();
    }, [session]);

    if (!session) {
        return (
            <div className="mt-8" />
        );
    }

    if (loading) {
        return <div className="mt-8"><h3 className="text-xl font-semibold">🏆 달성한 업적</h3><p className="text-gray-500 mt-4">업적을 불러오는 중...</p></div>;
    }

    return (
        <section className="mt-8">
            <h3 className="text-xl font-semibold">🏆 달성한 업적</h3>
            {achievements.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                    {achievements.map(({ achievement, unlockedAt }) => {
                        const IconComponent = achievementIconMap[achievement.icon] || FaAward;
                        return (
                            <div key={achievement._id} className="bg-white dark:bg-gray-900 rounded-lg shadow-md inset-shadow-xs p-4 flex items-center gap-4 border border-gray-200 dark:border-gray-700">
                                <div className="text-yellow-500">
                                    <IconComponent size={32} />
                                </div>
                                <div>
                                    <h4 className="font-semibold text-gray-800 dark:text-gray-200">{achievement.name}</h4>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{achievement.description}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        달성일: {new Date(unlockedAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="text-gray-500 dark:text-gray-400 mt-4">아직 달성한 업적이 없습니다.</p>
            )}
        </section>
    );
}