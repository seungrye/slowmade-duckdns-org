import type { MetadataRoute } from 'next'

const URL = 'https://slowmade.duckdns.org'; // 여기에 실제 웹사이트 도메인을 입력하세요.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    //   disallow: '/private/',
    },
    sitemap: `${URL}/sitemap.xml`,
  }
}