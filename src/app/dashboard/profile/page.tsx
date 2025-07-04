import MyProfile from "@/components/my-profile";
import MyAchievements from "@/components/my-achievements";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  
  return (
    <main className="container mx-auto px-4 py-6">
      {/* 프로필 정보 */}
      <MyProfile session={session} />
      {/* 달성한 업적 */}
      <MyAchievements session={session} />
      {/* 내가 올린 유머 */}
      {/* <MyHumorList/> */}
    </main>
  );
}
