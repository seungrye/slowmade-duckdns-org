'use client';
import FloatingMenu from "@/components/floating-menu";
import InfinitPostList, { InfinitPostListRef } from "@/components/infinite-post";
import { useRef } from "react";

export default function ContentSection() {
  const listRef = useRef<InfinitPostListRef>(null);

  const handleExpandAll = () => {
    listRef.current?.expandAll();
  };

  const handleCollapseAll = () => {
    listRef.current?.collapseAll();
  };

  return (
    <>
      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">🔥 최신 유머</h2>
        <InfinitPostList ref={listRef} />
      </section>

      {/* 우측 하단 플로팅 메뉴 */}
      <FloatingMenu 
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
      />
    </>
  );
}
