import MyProfile from "@/app/dashboard/profile/my-profile.section";
import MyAchievements from "@/app/dashboard/profile/my-achievements.section";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  
  return (
    <main className="px-4 py-6">
      {/* 프로필 정보 */}
      <MyProfile session={session} />
      {/* 달성한 업적 */}
      <MyAchievements session={session} />
      {/* 내가 올린 유머 */}
      {/* <MyHumorList/> */}
    </main>
  );
}
