import MyProfile from "@/components/my-profile";
import MyAchievements from "@/components/my-achievements";

export default function ProfilePage() {
  
  return (
    <main className="container mx-auto px-4 py-6">
      {/* 프로필 정보 */}
      <MyProfile/>
      {/* 달성한 업적 */}
      <MyAchievements />
      {/* 내가 올린 유머 */}
      {/* <MyHumorList/> */}
    </main>
  );
}
