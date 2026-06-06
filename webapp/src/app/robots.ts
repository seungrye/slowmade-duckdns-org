import type { MetadataRoute } from 'next'

const URL = 'https://slowmade.duckdns.org'; // 여기에 실제 웹사이트 도메인을 입력하세요.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // #311 — /scenes/graph 는 *내부 콘텐츠 편집 도구* (검색엔진 노출 의미 없음).
      //   /scenes/[id] 도 마찬가지. 사용자가 직접 들어오면 OK 지만 인덱싱 차단.
      disallow: ['/scenes/graph', '/scenes/'],
    },
    sitemap: `${URL}/sitemap.xml`,
  }
}