import { getAllPosts } from '@/lib/posts';
import { MetadataRoute } from 'next';

const URL = 'https://slowmade.duckdns.org'; // 여기에 실제 웹사이트 도메인을 입력하세요.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. 정적 페이지에 대한 경로 추가
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: URL,
      lastModified: new Date(),
      changeFrequency: "yearly", // 'yearly'는 MetadataRoute.SitemapChangeFrequency에 포함됩니다.
      priority: 1,
    },
    {
      url: `${URL}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly", // 'monthly'는 MetadataRoute.SitemapChangeFrequency에 포함됩니다.
      priority: 1,
    },
    {
      url: `${URL}/dashboard/profile`, // 프로필 페이지
      lastModified: new Date(),
      changeFrequency: "monthly", // 'monthly'는 MetadataRoute.SitemapChangeFrequency에 포함됩니다.
      priority: 1,
    },
    {
      url: `${URL}/dashboard/posts`, // 내가 올린 자료
      lastModified: new Date(),
      changeFrequency: "daily", // 'daily'는 MetadataRoute.SitemapChangeFrequency에 포함됩니다.
      priority: 0.8, 
    },
  ];

  // 2. 동적 페이지 (게시물)에 대한 경로 추가
  const posts = await getAllPosts(); // DB나 API에서 모든 게시물 정보를 가져옵니다.

  const postRoutes: MetadataRoute.Sitemap = posts.map((post: { id: string; createdAt: Date }) => ({
    url: `${URL}/post/view/${post.id}`,
    lastModified: post.createdAt, 
    changeFrequency: "weekly", // 'weekly'는 MetadataRoute.SitemapChangeFrequency에 포함됩니다.
    priority: 0.7,
  }));

  // 3. 정적 경로와 동적 경로를 합쳐서 반환
  return [...staticRoutes, ...postRoutes];
}