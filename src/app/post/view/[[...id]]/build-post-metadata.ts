import { Metadata } from 'next';

export interface PostMetadataInput {
  id: string;
  title: string;
  htmlContent: string;
  author: string;
  createdAt: Date | string;
  tags: string[];
  siteUrl: string;
}

export function buildPostMetadata({
  id,
  title,
  htmlContent,
  author,
  createdAt,
  tags,
  siteUrl,
}: PostMetadataInput): Metadata {
  const description = htmlContent
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  const url = `${siteUrl}/post/view/${id}`;
  const publishedTime = new Date(createdAt).toISOString();

  return {
    title,
    description,
    keywords: tags,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      siteName: 'Slowmade',
      publishedTime,
      authors: [author],
      tags,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}
