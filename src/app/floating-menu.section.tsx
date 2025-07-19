'use client';

import { useCallback, useState } from 'react';
import { Plus, ArrowUpToLine, PanelTopClose, PanelTopOpen, ChevronUp, ChevronDown } from 'lucide-react'; // 아이콘 라이브러리 예시 (lucide-react)

interface FloatingMenuProps {
    onExpandAll?: () => void;
    onCollapseAll?: () => void;
    onScrollToPrev?: () => void; // 이전 게시물로 스크롤하는 함수
    onScrollToNext?: () => void; // 다음 게시물로 스크롤하는 함수
}

export default function FloatingMenu({ onExpandAll, onCollapseAll, onScrollToPrev, onScrollToNext }: FloatingMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isAllExpanded, setIsAllExpanded] = useState(false);

    const handleScrollToTop = useCallback(() => {
        requestAnimationFrame(() => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        });
    }, []);

    const toggleExpandCollapse = useCallback(() => {
        if (isAllExpanded) {
            onCollapseAll?.();
        } else {
            onExpandAll?.();
        }
        setIsAllExpanded(!isAllExpanded);
    }, [isAllExpanded, onExpandAll, onCollapseAll]);

    const toggleMenu = useCallback(() => {
        setIsOpen(!isOpen);
    }, [isOpen]);

    return (
        <div
            onMouseLeave={() => setIsOpen(false)}
            className="fixed bottom-5 right-5 z-50 flex flex-col items-end"
            aria-live="polite"
        >
            {/* ┛ 모양으로 펼쳐질 메뉴 아이템들 */}
            <div className="flex flex-col items-end">
                {/* 최 상단으로 이동 */}
                <div
                    className={`mb-3 transform transition-all duration-300 ease-in-out ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
                        }`}
                >
                    <button onClick={handleScrollToTop} className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600" title="최 상단으로 이동">
                        <ArrowUpToLine size={20} color="white" />
                    </button>
                </div>
                {/* 이전 게시물로 scroll */}
                <div
                    className={`mb-3 transform transition-all duration-300 ease-in-out ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
                        }`}
                >
                    <button onClick={() => onScrollToPrev?.()} className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600" title="이전 게시물">
                        <ChevronUp size={20} color="white" />
                    </button>
                </div>

                {/* 다음 게시물로 scroll */}
                <div
                    className={`mb-3 transform transition-all duration-300 ease-in-out ${isOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
                        }`}
                >
                    <button onClick={() => onScrollToNext?.()} className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600" title="다음 게시물">
                        <ChevronDown size={20} color="white" />
                    </button>
                </div>


                <div className="flex items-center ">
                    {/* 좌측 메뉴 (삭제) */}
                    <div className={`mr-3 transform transition-all duration-300 ease-in-out ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0 pointer-events-none'
                        }`}>
                        <button onClick={toggleExpandCollapse} className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600" title="삭제">
                            {isAllExpanded ? <PanelTopClose size={20} /> : <PanelTopOpen size={20} />}
                        </button>
                    </div>

                    {/* 메인 플로팅 버튼 */}
                    <button
                        onMouseEnter={() => setIsOpen(true)}
                        onClick={toggleMenu}
                        className={`flex h-12 w-12 items-center justify-center rounded-full bg-black ${isOpen ? `opacity-100` : `opacity-40`} text-white shadow transition-transform duration-300 ease-in-out`} aria-haspopup="true" aria-expanded={isOpen}>
                        <div className={`transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}>
                            <Plus size={24} />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}