'use client';

import { useEffect, useState } from 'react';
import PostViewContainer from './post-view-container';

/**
 * Loads a private (or non-existent) post on the client, authenticated. The server page never calls auth(),
 * so a public post's static cache holds, while a private one is fetched here through /api/post (a session-based privacy filter)
 * and rendered **for the author alone**. When it cannot be fetched (someone else, logged out, or absent) it is 'not found'.
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

  // The server's generateMetadata cannot give a private post's title (it loads public only -> "Post Not Found | Slowmade").
  // When the author loads it successfully on the client, the tab title is set to the real title (the suffix matching the layout template).
  // Navigating elsewhere makes Next reset the metadata, so no cleanup is needed.
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
