import { describe, it, expect } from 'vitest';
import { buildArticleJsonLd } from './article-json-ld';

const base = {
  title: '테스트 게시글',
  description: '본문 요약',
  author: '작성자',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  tags: ['react', 'nextjs'],
  url: 'https://example.com/post/view/abc123',
};

describe('buildArticleJsonLd', () => {
  it('schema.org Article 스키마를 반환한다', () => {
    const result = buildArticleJsonLd(base);
    expect(result['@context']).toBe('https://schema.org');
    expect(result['@type']).toBe('Article');
  });

  it('제목, 설명, URL을 그대로 포함한다', () => {
    const result = buildArticleJsonLd(base);
    expect(result.headline).toBe('테스트 게시글');
    expect(result.description).toBe('본문 요약');
    expect(result.url).toBe('https://example.com/post/view/abc123');
  });

  it('author를 Person 스키마로 감싼다', () => {
    const result = buildArticleJsonLd(base);
    expect(result.author).toEqual({ '@type': 'Person', name: '작성자' });
  });

  it('createdAt을 ISO 8601 문자열로 변환한다', () => {
    const result = buildArticleJsonLd(base);
    expect(result.datePublished).toBe('2024-01-15T10:00:00.000Z');
  });

  it('태그 배열을 쉼표로 구분된 문자열로 변환한다', () => {
    const result = buildArticleJsonLd(base);
    expect(result.keywords).toBe('react, nextjs');
  });

  it('태그가 없으면 빈 문자열을 반환한다', () => {
    const result = buildArticleJsonLd({ ...base, tags: [] });
    expect(result.keywords).toBe('');
  });

  it('createdAt이 문자열이어도 ISO 변환된다', () => {
    const result = buildArticleJsonLd({ ...base, createdAt: '2024-01-15T10:00:00Z' });
    expect(result.datePublished).toBe('2024-01-15T10:00:00.000Z');
  });
});
