import MyProfile from "@/app/dashboard/profile/my-profile.section";
import MyAchievements from "@/app/dashboard/profile/my-achievements.section";
import TodayFortuneSection from "@/app/dashboard/profile/today-fortune.section";
import { auth } from "@/auth";

export default async function ProfilePage() {
  const session = await auth();
  
  return (
    <main className="mx-auto px-4 py-6">
      {/* 프로필 정보 */}
      <MyProfile session={session} />
      {/* 오늘의 운세(타로) — 토스트가 데려오는 섹션 (#388) */}
      <TodayFortuneSection />
      {/* 달성한 업적 */}
      <MyAchievements session={session} />
    </main>
  );
}
