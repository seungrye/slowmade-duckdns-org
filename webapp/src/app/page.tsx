import type { Metadata } from 'next'
import ContentSection from "./content.section";
import { getPaginatedPosts } from "@/lib/posts";
import { env } from "@/lib/env";
import { auth } from "@/auth";

export const metadata: Metadata = {
  // 키워드(유머·이야기·Slowmade)를 제목에 담아 검색엔진 주제 인식을 돕는다.
  title: 'Slowmade — 느리게 제대로 만드는 유머와 이야기',
  // 150~220자 권장(SEO). 키워드를 자연스럽게 분산.
  description:
    '느리게, 하지만 제대로. Slowmade 는 손으로 고른 최신 유머 글과 일상 이야기를 한곳에 모아 보여주는 공간입니다. 매일 새로 올라오는 유머와 짧은 생각, 소소한 이야기를 부담 없이 둘러보고, 마음에 드는 글에는 좋아요와 댓글을 남기며 함께 즐겨보세요.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Slowmade — 느리게 제대로 만드는 유머와 이야기',
    description: '손으로 고른 최신 유머 글과 일상 이야기를 모아 보여주는 공간, Slowmade.',
    url: env.siteUrl,
    type: 'website',
  },
};

// 홈 최신 목록은 자주 바뀌므로 요청마다 SSR(첫 화면 데이터를 서버에서 렌더).
export const dynamic = 'force-dynamic';

export default async function Home() {
  // 초기 9건을 서버에서 미리 로드해 InfinitPostList 초기값으로 주입(첫 페이지 CSR fetch 제거).
  // 파라미터는 /api/posts route 와 동일하게 맞춘다(sort=latest, withComments=true).
  // 로그인한 작성자는 자기 비공개 글도 피드에 보인다(viewer=본인 email).
  const session = await auth();
  const { posts } = await getPaginatedPosts(1, 9, 'latest', null, true, session?.user?.email ?? null);

  // 홈 구조화 데이터(WebSite) — 검색엔진의 주제·사이트 이해를 돕는다.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Slowmade',
    url: env.siteUrl,
    description: '느리게, 하지만 제대로 만드는 유머와 이야기 공간',
    inLanguage: 'ko',
  };

  return (
    <main className="mx-auto px-4 py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* SEO 용 H1 — 시각적으로는 숨기고(레이아웃 유지) 검색엔진에 주제를 전달. */}
      <h1 className="sr-only">Slowmade — 최신 유머와 일상 이야기</h1>
      <ContentSection initialPosts={posts} />
    </main>
  );
}
