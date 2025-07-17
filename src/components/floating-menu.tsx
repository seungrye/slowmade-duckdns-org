'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Trash2, ScrollIcon, Scroll, ArrowUpToLine, ExpandIcon, ListCollapse, LucideListCollapse, PanelTopClose } from 'lucide-react'; // 아이콘 라이브러리 예시 (lucide-react)
import { FaExpand, FaExpandAlt } from 'react-icons/fa';
import { FcCollapse } from 'react-icons/fc';

interface FloatingMenuProps {
    postId: string;
    // 나중에 onDelete와 같은 함수를 props로 받아 처리할 수 있습니다.
}

export default function FloatingMenu({ }: FloatingMenuProps) {
    const [isOpen, setIsOpen] = useState(false);

    const handleScrollToTop = () => {
        requestAnimationFrame(() => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        });

    };

    const handleExpandAll = () => {
        // 모든 게시물을 펼치는 로직을 구현합니다.
        console.log('Expanding all posts...');
        // 예: await expandAllPosts();
        alert('모든 게시물이 펼쳐졌습니다.'); // 실제 구현에서는 API 응답에 따라 처리
    };

    const handleCollapseAll = () => {
        // 모든 게시물을 접는 로직을 구현합니다.
        console.log('Collapsing all posts...');
        // 예: await collapseAllPosts();
        alert('모든 게시물이 접혔습니다.'); // 실제 구현에서는 API 응답에 따라 처리
    };

    return (
        <div
            className="fixed bottom-5 right-5 z-50 flex flex-col items-end"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            aria-live="polite"
        >
            {/* ┛ 모양으로 펼쳐질 메뉴 아이템들 */}
            <div className="flex flex-col items-end">
                {/* 상단 메뉴 (수정) */}
                <div
                    className={`mb-3 transform transition-all duration-300 ease-in-out ${
                        isOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
                    }`}
                >
                    <button onClick={handleScrollToTop} className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600" title="수정">
                        <ArrowUpToLine size={20} />
                    </button>
                </div>

                <div className="flex items-center">
                    {/* 좌측 메뉴 (삭제) */}
                    <div className={`mr-3 transform transition-all duration-300 ease-in-out ${
                        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 pointer-events-none'
                    }`}>
                        <button onClick={handleExpandAll} className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600" title="삭제">
                            <PanelTopClose size={20} />
                        </button>
                    </div>

                    {/* 메인 플로팅 버튼 */}
                    <button className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow transition-transform duration-300 ease-in-out hover:bg-blue-700" aria-haspopup="true" aria-expanded={isOpen}>
                        <div className={`transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}>
                            <Plus size={24} />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}