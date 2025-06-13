import MyProfile from "@/components/my-profile";

export default function ProfilePage() {
  
  return (
    <main className="container mx-auto px-4 py-6">
      {/* 프로필 정보 */}
      <MyProfile/>
      {/* 내가 올린 유머 */}
      {/* <MyHumorList/> */}
    </main>
  );
}
