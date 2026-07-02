import { getAllPosts } from '@/lib/posts';
import { MetadataRoute } from 'next';
import { env } from '@/lib/env';

const URL = env.siteUrl;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: URL,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 1,
    },
    // #311 web-adventure 공개 영역 sitemap 등록.
    {
      url: `${URL}/games/web-adventure`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${URL}/games/web-adventure/play`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${URL}/games/web-adventure/gallery`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const posts = await getAllPosts();

  const postRoutes: MetadataRoute.Sitemap = posts.map((post: { id: string; createdAt: Date }) => ({
    url: `${URL}/post/view/${post.id}`,
    lastModified: post.createdAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...postRoutes];
}