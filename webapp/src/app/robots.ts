import type { MetadataRoute } from 'next'
import { env } from '@/lib/env';

const URL = env.siteUrl; // The canonical domain (SITE_URL, falling back to NEXTAUTH_URL).

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // #311 - /scenes/graph is *an internal content editing tool* (there is no point exposing it to search engines).
      //   The same goes for /scenes/[id]. A user reaching it directly is fine, but indexing is blocked.
      disallow: ['/scenes/graph', '/scenes/'],
    },
    sitemap: `${URL}/sitemap.xml`,
  }
}