export interface ArticleJsonLdProps {
  title: string;
  description: string;
  author: string;
  createdAt: Date | string;
  tags: string[];
  url: string;
}

export function buildArticleJsonLd({
  title,
  description,
  author,
  createdAt,
  tags,
  url,
}: ArticleJsonLdProps) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description,
    author: {
      '@type': 'Person',
      name: author,
    },
    datePublished: new Date(createdAt).toISOString(),
    keywords: tags.join(', '),
    url,
  };
}
