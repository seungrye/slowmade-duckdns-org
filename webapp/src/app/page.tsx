import type { Metadata } from 'next'
import ContentSection from "./content.section";
import { getPaginatedPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: 'Handmade Site - Home',
  description: 'Overview of the latest posts',
};

// 홈 최신 목록은 자주 바뀌므로 요청마다 SSR(첫 화면 데이터를 서버에서 렌더).
export const dynamic = 'force-dynamic';

export default async function Home() {
  // 초기 9건을 서버에서 미리 로드해 InfinitPostList 초기값으로 주입(첫 페이지 CSR fetch 제거).
  // 파라미터는 /api/posts route 와 동일하게 맞춘다(sort=latest, withComments=true).
  const { posts } = await getPaginatedPosts(1, 9, 'latest', null, true);
  return (
    <main className="mx-auto px-4 py-6">
      <ContentSection initialPosts={posts} />
    </main>
  );
}
