import MyHumorList from "@/components/my-humor-list";
import MyProfile from "@/components/my-profile";

export default function ProfilePage() {
  
  return (
    <main className="container mx-auto px-4 py-6">
      {/* 프로필 정보 */}
      <MyProfile/>

      {/* 내가 올린 유머 */}
      <MyHumorList/>

      {/* 저장한 유머 */}
      {/* <section className="mt-8">
        <h3 className="text-xl font-semibold">🔖 저장한 유머</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-4">
          {savedHumorList.length > 0 ? (
            savedHumorList.map((humor) => (
              <div key={humor.id} className="bg-white rounded-lg shadow-md p-4">
                <Image src={humor.image} alt={humor.title} width={300} height={200} className="rounded-md" />
                <h4 className="mt-3 text-lg font-semibold">{humor.title}</h4>
                <p className="text-gray-500 text-sm">조회수 {humor.views} • 댓글 {humor.comments}</p>
                <Link href={`/humor/${humor.id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
              </div>
            ))
          ) : (
            <p className="text-gray-500">저장한 유머가 없습니다.</p>
          )}
        </div>
      </section> */}
    </main>
  );
}
