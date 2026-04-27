import MyProfile from "@/app/dashboard/profile/my-profile.section";
import MyAchievements from "@/app/dashboard/profile/my-achievements.section";
import { auth } from "@/auth";

export default async function ProfilePage() {
  const session = await auth();
  
  return (
    <main className="mx-auto px-4 py-6">
      {/* 프로필 정보 */}
      <MyProfile session={session} />
      {/* 달성한 업적 */}
      <MyAchievements session={session} />
      {/* 내가 올린 유머 */}
      {/* <MyHumorList/> */}
    </main>
  );
}
