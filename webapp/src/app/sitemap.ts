import { getAllPosts } from '@/lib/posts';
import { MetadataRoute } from 'next';

const URL = 'https://slowmade.duckdns.org';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: URL,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 1,
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