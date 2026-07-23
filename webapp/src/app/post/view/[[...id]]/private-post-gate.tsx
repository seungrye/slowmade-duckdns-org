'use client';

import { useEffect, useState } from 'react';
import PostViewContainer from './post-view-container';

/**
 * 비공개(또는 존재하지 않는) 글을 클라이언트에서 인증 로드한다. 서버 페이지가 auth() 를 호출하지
 * 않아 공개 글의 정적 캐시가 유지되고, 비공개 글은 여기서 /api/post(세션 기반 privacy 필터)로 받아
 * **작성자 본인에게만** 렌더한다. 못 받으면(타인·비로그인·없는 글) '찾을 수 없음'.
 */
type Loaded = {
  _id: string; title: string; jsonContent: unknown; likes?: number; tags?: string[]; aiTags?: string[];
  userEmail: string; author: string; createdAt: string; isPrivate?: boolean;
  attachments?: { id: string; name: string; size: number; mimeType: string }[];
};

export default function PrivatePostGate({ id }: { id: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'nope'>('loading');
  const [post, setPost] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/post?_id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const p = j?.data;
        if (p && p._id) { setPost(p as Loaded); setState('ok'); }
        else setState('nope');
      })
      .catch(() => { if (alive) setState('nope'); });
    return () => { alive = false; };
  }, [id]);

  // 비공개 글은 서버 generateMetadata 가 제목을 못 준다(공개만 로드 → "Post Not Found | Slowmade").
  // 작성자 본인이 클라에서 로드에 성공하면 실제 제목으로 탭 제목을 세팅(접미사는 layout 템플릿과 동일).
  // 다른 페이지로 이동하면 Next 메타데이터가 재설정하므로 cleanup 불필요.
  useEffect(() => {
    if (state === 'ok' && post?.title) document.title = `${post.title} | Slowmade`;
  }, [state, post]);

  if (state === 'loading') {
    return <div className="mx-auto px-4 py-16 text-center text-gray-400">불러오는 중…</div>;
  }
  if (state === 'nope' || !post) {
    return <div className="mx-auto px-4 py-20 text-center text-gray-500">글을 찾을 수 없습니다.</div>;
  }
  return (
    <PostViewContainer
      post={{
        _id: String(post._id),
        title: post.title,
        jsonContent: post.jsonContent,
        likes: post.likes ?? 0,
        tags: post.tags ?? [],
        aiTags: post.aiTags ?? [],
        userEmail: post.userEmail,
        author: post.author,
        createdAt: new Date(post.createdAt).toISOString(),
        isPrivate: !!post.isPrivate,
        attachments: (post.attachments ?? []).map((a) => ({
          id: a.id, name: a.name, size: a.size, mimeType: a.mimeType,
        })),
      }}
    />
  );
}
