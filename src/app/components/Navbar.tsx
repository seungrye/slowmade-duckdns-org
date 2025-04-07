"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import {
    Menu,
    X,
    ChevronDown,
    User,
    Archive,
    Search,
    Upload,
    Shuffle,
    Home,
    Settings,
    LogOut,
    Layers,
    LogIn,
} from "lucide-react";

const navLinks = [
    { href: "/", label: "홈", description: "사이트로 돌아가기", icon: <Home size={20} /> },
    { href: "/archive", label: "아카이브", description: "유머 아카이브 보기", icon: <Archive size={20} /> },
    { href: "/search", label: "검색", description: "유머 검색하기", icon: <Search size={20} /> },
    { href: "/random", label: "랜덤 유머", description: "무작위 유머 보기", icon: <Shuffle size={20} /> },
];

const myPageLinks = [
    { href: "/profile", label: "내 프로필", description: "회원 정보 보기", icon: <User size={20} /> },
    { href: "/my-uploads", label: "내가 올린 유머", description: "내가 업로드한 유머 보기", icon: <Archive size={20} /> },
    { href: "/upload", label: "유머 업로드", description: "새로운 유머 업로드하기", icon: <Upload size={20} /> },
    { href: "/settings", label: "설정", description: "계정 설정하기", icon: <Settings size={20} /> },
];

export default function Navbar() {
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const pathname = usePathname();
    const dropdownRef = useRef<HTMLLIElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <nav className="bg-gray-900 text-white shadow-lg">
            <div className="container mx-auto px-4 py-3 flex justify-between items-center">
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

                    {/* 로그인 상태에 따라 메뉴 변경 */}
                    {session ? (
                        // 로그인한 경우: "마이페이지" 메뉴
                        <li className="relative" ref={dropdownRef}>
                            <button
                                className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
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
                <button className="md:hidden text-gray-500" onClick={() => setIsOpen(!isOpen)}>
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
                            {myPageLinks.map((link) => (
                                <li key={link.href} className="text-center">
                                    <Link
                                        href={link.href}
                                        className="py-2 hover:bg-gray-600 transition flex items-center gap-1 justify-center"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        {link.icon}
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                            <li className="text-center">
                                <button
                                    className="py-2 w-full hover:bg-gray-600 transition flex items-center gap-1 justify-center"
                                    onClick={() => signOut()}
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
