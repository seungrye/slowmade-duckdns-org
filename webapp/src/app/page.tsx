import type { Metadata } from 'next'
import ContentSection from "./content.section";
import { getPaginatedPosts } from "@/lib/posts";
import { env } from "@/lib/env";
import { auth } from "@/auth";

export const metadata: Metadata = {
  // Keywords (humour, stories, Slowmade) in the title help search engines recognise the topic.
  title: 'Slowmade — 느리게 제대로 만드는 유머와 이야기',
  // 150-220 characters recommended (SEO). Keywords spread naturally.
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

// The home page's latest list changes often, so it is SSR per request (the first screen's data rendered on the server).
export const dynamic = 'force-dynamic';

export default async function Home() {
  // The first 9 are preloaded on the server and injected as InfinitPostList's initial value (removing the first page's CSR fetch).
  // The parameters match the /api/posts route (sort=latest, withComments=true).
  // A logged-in author sees their own private posts in the feed too (viewer = their own email).
  const session = await auth();
  const { posts } = await getPaginatedPosts(1, 9, 'latest', null, true, session?.user?.email ?? null);

  // The home page's structured data (WebSite) - it helps search engines understand the topic and the site.
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
