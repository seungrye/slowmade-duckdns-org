"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
    Menu,
    X,
    ChevronDown,
    User,
    Archive,
    Upload,
    Home,
    LogOut,
    Layers,
    LogIn,
    Settings,
    ScrollText,
    Users,
    Package,
    MapPin,
    Skull,
    Gamepad2,
} from "lucide-react";

const navLinks = [
    { href: "/", label: "홈", description: "사이트로 돌아가기", icon: <Home size={20} /> },
    { href: "/tags", label: "태그", description: "태그 클라우드 보기", icon: <Layers size={20} /> },
    { href: "/games/bevy-rogue", label: "게임", description: "Bevy Rogue 브라우저 게임", icon: <Gamepad2 size={20} /> },
];

const myPageLinks = [
    { href: "/dashboard/profile", label: "내 프로필", description: "회원 정보 보기", icon: <User size={20} /> },
    { href: "/dashboard/posts", label: "내가 올린 유머", description: "내가 업로드한 유머 보기", icon: <Archive size={20} /> },
    { href: "/dashboard/settings", label: "설정", description: "내 설정 보기", icon: <Settings size={20} /> },
    { href: "/post/write", label: "유머 업로드", description: "새로운 유머 업로드하기", icon: <Upload size={20} /> },
];

const questLinks = [
    { href: "/quests", label: "퀘스트", description: "퀘스트 목록·편집", icon: <ScrollText size={20} /> },
    { href: "/quests/villagers", label: "Villager 카탈로그", description: "NPC 정의 관리", icon: <Users size={20} /> },
    { href: "/quests/items", label: "Item 카탈로그", description: "아이템 정의 관리", icon: <Package size={20} /> },
    { href: "/quests/zones", label: "Zone 카탈로그", description: "Named 존 정의 관리", icon: <MapPin size={20} /> },
    { href: "/quests/monsters", label: "Monster 카탈로그", description: "몬스터 정의 관리", icon: <Skull size={20} /> },
];

export default function Navbar() {
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isQuestDropdownOpen, setIsQuestDropdownOpen] = useState(false);
    const pathname = usePathname();
    const dropdownRef = useRef<HTMLLIElement>(null);
    const questDropdownRef = useRef<HTMLLIElement>(null);

    const isQuestActive = pathname === "/quests" || pathname.startsWith("/quests/");
    const isMyPageActive = pathname === "/post/write" || pathname.startsWith("/dashboard");

    // 모바일 메뉴 내부 collapsible 섹션 상태.
    // 활성 라우트면 시작부터 펴진 상태로(사용자가 현재 위치한 그룹을 바로 인지하도록).
    const [isMobileQuestOpen, setIsMobileQuestOpen] = useState<boolean>(isQuestActive);
    const [isMobileMyPageOpen, setIsMobileMyPageOpen] = useState<boolean>(isMyPageActive);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (questDropdownRef.current && !questDropdownRef.current.contains(event.target as Node)) {
                setIsQuestDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <nav className="bg-gray-900 text-white shadow-lg">
            <div className="lg:container mx-auto px-4 py-3 flex justify-between items-center">
                {/* 로고 */}
                <Link href={navLinks[0].href} className="text-2xl font-bold text-gray-300 flex items-center gap-2">
                    <Layers size={30} />
                    Handmade Site
                </Link>

                {/* 데스크탑 메뉴 */}
                <ul className="hidden md:flex space-x-6 items-center">
                    {navLinks.map((link) => (
                        <li key={link.href} className="relative group">
                            <Link
                                href={link.href}
                                className={`${pathname === link.href ? "text-gray-400" : "text-gray-500"
                                    } hover:text-gray-300 transition flex items-center gap-1`}
                            >
                                {link.icon}
                                {link.label}
                            </Link>
                        </li>
                    ))}

                    {/* 퀘스트 드롭다운 (인증 사용자만) */}
                    {session && (
                        <li className="relative" ref={questDropdownRef}>
                            <button
                                className={`flex items-center gap-1 ${isQuestActive ? "text-gray-400" : "text-gray-500"} hover:text-gray-300 transition`}
                                onClick={() => {
                                    setIsQuestDropdownOpen(!isQuestDropdownOpen);
                                    setIsDropdownOpen(false);
                                }}
                                aria-label="퀘스트 메뉴"
                            >
                                <ScrollText size={20} /> 퀘스트 <ChevronDown size={16} />
                            </button>

                            {isQuestDropdownOpen && (
                                <ul className="absolute right-0 mt-2 w-48 bg-gray-800 shadow-lg rounded-lg overflow-hidden z-20">
                                    {questLinks.map((link) => (
                                        <li key={link.href}>
                                            <Link
                                                href={link.href}
                                                className="px-4 py-2 hover:bg-gray-700 transition flex items-center gap-1"
                                                onClick={() => setIsQuestDropdownOpen(false)}
                                            >
                                                {link.icon}
                                                {link.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    )}

                    {/* 로그인 상태에 따라 메뉴 변경 */}
                    {session ? (
                        // 로그인한 경우: "마이페이지" 메뉴
                        <li className="relative" ref={dropdownRef}>
                            <button
                                className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition"
                                onClick={() => {
                                    setIsDropdownOpen(!isDropdownOpen);
                                    setIsQuestDropdownOpen(false);
                                }}
                                aria-label="마이페이지 메뉴"
                            >
                                <User size={20} /> 마이페이지 <ChevronDown size={16} />
                            </button>

                            {isDropdownOpen && (
                                <ul className="absolute right-0 mt-2 w-48 bg-gray-800 shadow-lg rounded-lg overflow-hidden z-20">
                                    {myPageLinks.map((link) => (
                                        <li key={link.href}>
                                            <Link
                                                href={link.href}
                                                className="px-4 py-2 hover:bg-gray-700 transition flex items-center gap-1"
                                                onClick={() => setIsDropdownOpen(false)}
                                            >
                                                {link.icon}
                                                {link.label}
                                            </Link>
                                        </li>
                                    ))}
                                    {/* 로그아웃 버튼 */}
                                    <li>
                                        <button
                                            className="px-4 py-2 w-full text-left hover:bg-gray-700 transition flex items-center gap-1"
                                            onClick={() => signOut()}
                                            aria-label="로그아웃"
                                        >
                                            <LogOut size={20} />
                                            로그아웃
                                        </button>
                                    </li>
                                </ul>
                            )}
                        </li>
                    ) : (
                        // 로그인하지 않은 경우: "로그인" 버튼
                        <li className="relative group">
                            <Link
                                href='/login'
                                className={`${pathname === '/login' ? "text-gray-400" : "text-gray-500"
                                    } hover:text-gray-300 transition flex items-center gap-1`}
                            >
                                <LogIn size={20} /> 로그인
                            </Link>
                        </li>
                    )}
                </ul>

                {/* 모바일 메뉴 버튼 */}
                <button className="md:hidden text-gray-500" onClick={() => setIsOpen(!isOpen)}
                    aria-label="모바일 메뉴 열기"
                >
                    {isOpen ? <X size={28} /> : <Menu size={28} />}
                </button>
            </div>

            {/* 모바일 메뉴 */}
            {isOpen && (
                <ul className="md:hidden bg-gray-800 space-y-2 py-2 px-4">
                    {navLinks.map((link) => (
                        <li key={link.href} className="text-center">
                            <Link
                                href={link.href}
                                className={`block py-2 ${pathname === link.href ? "text-gray-400" : "text-gray-500"
                                    } hover:text-gray-300 transition flex items-center gap-1`}
                                onClick={() => setIsOpen(false)}
                            >
                                {link.icon}
                                {link.label}
                            </Link>
                        </li>
                    ))}

                    {/* 로그인 상태에 따라 모바일 메뉴 변경 */}
                    {session ? (
                        <>
                            {/* 퀘스트 collapsible 섹션 */}
                            <li>
                                <button
                                    type="button"
                                    className={`w-full py-2 px-2 hover:bg-gray-700 transition flex items-center justify-between gap-1 ${isQuestActive ? "text-gray-400" : "text-gray-300"}`}
                                    onClick={() => setIsMobileQuestOpen((v) => !v)}
                                    aria-label="모바일 퀘스트 섹션 토글"
                                    aria-expanded={isMobileQuestOpen}
                                >
                                    <span className="flex items-center gap-2">
                                        <ScrollText size={20} />
                                        퀘스트
                                    </span>
                                    <ChevronDown
                                        size={18}
                                        className={`transition transform ${isMobileQuestOpen ? "rotate-180" : ""}`}
                                    />
                                </button>
                                {isMobileQuestOpen && (
                                    <ul className="pl-6 border-l border-gray-700 ml-2 mt-1 space-y-1">
                                        {questLinks.map((link) => (
                                            <li key={link.href}>
                                                <Link
                                                    href={link.href}
                                                    className={`py-2 px-2 rounded hover:bg-gray-700 transition flex items-center gap-2 ${pathname === link.href ? "text-gray-400" : "text-gray-300"}`}
                                                    onClick={() => setIsOpen(false)}
                                                >
                                                    {link.icon}
                                                    {link.label}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>

                            {/* 마이페이지 collapsible 섹션 */}
                            <li>
                                <button
                                    type="button"
                                    className={`w-full py-2 px-2 hover:bg-gray-700 transition flex items-center justify-between gap-1 ${isMyPageActive ? "text-gray-400" : "text-gray-300"}`}
                                    onClick={() => setIsMobileMyPageOpen((v) => !v)}
                                    aria-label="모바일 마이페이지 섹션 토글"
                                    aria-expanded={isMobileMyPageOpen}
                                >
                                    <span className="flex items-center gap-2">
                                        <User size={20} />
                                        마이페이지
                                    </span>
                                    <ChevronDown
                                        size={18}
                                        className={`transition transform ${isMobileMyPageOpen ? "rotate-180" : ""}`}
                                    />
                                </button>
                                {isMobileMyPageOpen && (
                                    <ul className="pl-6 border-l border-gray-700 ml-2 mt-1 space-y-1">
                                        {myPageLinks.map((link) => (
                                            <li key={link.href}>
                                                <Link
                                                    href={link.href}
                                                    className={`py-2 px-2 rounded hover:bg-gray-700 transition flex items-center gap-2 ${pathname === link.href ? "text-gray-400" : "text-gray-300"}`}
                                                    onClick={() => setIsOpen(false)}
                                                >
                                                    {link.icon}
                                                    {link.label}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>

                            <li className="text-center">
                                <button
                                    className="py-2 w-full hover:bg-gray-600 transition flex items-center gap-1 justify-center"
                                    onClick={() => signOut()}
                                    aria-label="로그아웃"
                                >
                                    <LogOut size={20} />
                                    로그아웃
                                </button>
                            </li>
                        </>
                    ) : (
                        <li className="text-center">
                            <Link
                                href='/login'
                                className={`block py-2 ${pathname === '/login' ? "text-gray-400" : "text-gray-500"
                                    } hover:text-gray-300 transition flex items-center gap-1`}
                                onClick={() => setIsOpen(false)}
                            >
                                <LogIn size={20} /> 로그인
                            </Link>
                        </li>
                    )}
                </ul>
            )}
        </nav>
    );
}
