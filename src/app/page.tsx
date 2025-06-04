import Link from "next/link";
import InfiniteHumorList from "@/components/infinite-humors";

export default async function Home() {
  return (
    <main className="container mx-auto px-4 py-6">
      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">🔥 최신 유머</h2>
        <InfiniteHumorList />
      </section>

      {/* 히어로 섹션 */}
      {/* <section className="text-center py-10">
        <h1 className="text-4xl font-bold text-gray-800">오늘도 웃음을 잃지 마세요! 😂</h1>
        <p className="text-gray-600 mt-2">지금 가장 인기 있는 유머를 확인하세요.</p>
        <div className="mt-6">
          <Image src="/funny-image.jpg" alt="Funny Meme" width={500} height={300} className="rounded-lg shadow-lg mx-auto" />
        </div>
      </section> */}

      {/* 최신 유머 섹션 */}
      {/* <section className="mt-12">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">🔥 최신 유머</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {(await getPosts()).map((post: GetPostType) => (
            <div key={post._id} className="bg-white rounded-lg shadow-md p-4">
              <Image
                src={`/humor-${"default"}.jpg`}
                alt={post.title}
                width={300}
                height={200}
                className="rounded-md"
              />
              <h3 className="mt-3 text-lg font-semibold">{post.title}</h3>
              <p className="text-gray-500 text-sm">조회수 {formatNumber(post.views)} • 댓글 32</p>
              <Link href={`/humor/${post._id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
            </div>
          ))}
        </div>
      </section>
 */}
      {/* 랜덤 유머 섹션 */}
      {/* <section className="mt-12 text-center">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">🎲 랜덤 유머</h2>
        <button className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-600 transition">
          랜덤 유머 보기 →
        </button>
      </section> */}

      {/* 푸터 */}
      <footer className="mt-12 text-center text-gray-500 py-6 border-t">
        <p>© 2025 유머 아카이브 | <Link href="/about" className="text-blue-500">소개</Link> | <Link href="/contact" className="text-blue-500">문의하기</Link></p>
      </footer>
    </main>
  );
}
