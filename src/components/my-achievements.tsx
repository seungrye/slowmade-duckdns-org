'use client';

import { UserAchievementType } from "../types/achievements.d";
import { useEffect, useState } from "react";
import { type IconType } from "react-icons";
import { FaAward, FaPencilAlt } from "react-icons/fa"; // 예시 아이콘

// 데이터베이스의 아이콘 키와 실제 아이콘 컴포넌트를 매핑합니다.
const iconMap: { [key: string]: IconType } = {
  FaPencilAlt: FaPencilAlt,
  FaAward: FaAward,
  // 다른 아이콘들을 여기에 추가할 수 있습니다.
};

export default function MyAchievements() {
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

    fetchAchievements();
  }, []);

  if (loading) {
    return <div className="mt-8"><h3 className="text-xl font-semibold">🏆 달성한 업적</h3><p className="text-gray-500 mt-4">업적을 불러오는 중...</p></div>;
  }

  return (
    <section className="mt-8">
      <h3 className="text-xl font-semibold">🏆 달성한 업적</h3>
      {achievements.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          {achievements.map(({ achievement, unlockedAt }) => {
            const IconComponent = iconMap[achievement.icon] || FaAward;
            return (
              <div key={achievement._id} className="bg-white rounded-lg shadow-sm inset-shadow-xs p-4 flex items-center gap-4 border border-gray-200">
                <div className="text-yellow-500">
                  <IconComponent size={32} />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800">{achievement.name}</h4>
                  <p className="text-sm text-gray-600">{achievement.description}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    달성일: {new Date(unlockedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500 mt-4">아직 달성한 업적이 없습니다.</p>
      )}
    </section>
  );
}