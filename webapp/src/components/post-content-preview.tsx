'use client';

import dynamic from 'next/dynamic';
import { JSONContent } from '@tiptap/react';

const RichContentViewer = dynamic(
  () => import('@/components/rich-web-editor/viewer').then(mod => mod.RichContentViewer),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
    ),
  },
);

export default function PostContentPreview({ content }: { content: unknown }) {
  if (!content) return null;
  return (
    <div className="relative h-[200px] overflow-hidden">
      <RichContentViewer content={content as JSONContent} />
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none" />
    </div>
  );
}
