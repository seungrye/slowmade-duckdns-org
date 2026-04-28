import { describe, it, expect } from 'vitest';
import { buildPostMetadata } from './build-post-metadata';

const base = {
  id: 'abc123',
  title: '테스트 게시글',
  htmlContent: '<p>본문 내용입니다.</p>',
  author: '작성자',
  createdAt: new Date('2024-01-15T10:00:00Z'),
  tags: ['react', 'nextjs'],
  siteUrl: 'https://example.com',
};

describe('buildPostMetadata', () => {
  it('title과 description을 반환한다', () => {
    const result = buildPostMetadata(base);
    expect(result.title).toBe('테스트 게시글');
    expect(result.description).toBe('본문 내용입니다.');
  });

  it('htmlContent 태그를 제거해 description을 만든다', () => {
    const result = buildPostMetadata({ ...base, htmlContent: '<h1>제목</h1><p>내용</p>' });
    expect(result.description).toBe('제목 내용');
  });

  it('description을 160자로 자른다', () => {
    const long = 'a'.repeat(200);
    const result = buildPostMetadata({ ...base, htmlContent: long });
    expect((result.description as string).length).toBe(160);
  });

  it('canonical URL을 siteUrl + id로 설정한다', () => {
    const result = buildPostMetadata(base);
    expect(result.alternates?.canonical).toBe('https://example.com/post/view/abc123');
  });

  it('openGraph type이 article이다', () => {
    const result = buildPostMetadata(base);
    expect(result.openGraph?.type).toBe('article');
  });

  it('openGraph에 publishedTime과 author, tags를 포함한다', () => {
    const result = buildPostMetadata(base);
    const og = result.openGraph as Record<string, unknown>;
    expect(og.publishedTime).toBe('2024-01-15T10:00:00.000Z');
    expect(og.authors).toEqual(['작성자']);
    expect(og.tags).toEqual(['react', 'nextjs']);
  });

  it('twitter card를 summary로 설정한다', () => {
    const result = buildPostMetadata(base);
    expect(result.twitter?.card).toBe('summary');
  });

  it('keywords에 tags 배열을 그대로 전달한다', () => {
    const result = buildPostMetadata(base);
    expect(result.keywords).toEqual(['react', 'nextjs']);
  });
});
