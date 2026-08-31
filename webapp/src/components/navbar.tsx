"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import NotificationBell from "@/components/notification-bell";
import CalendarBadge from "@/components/calendar-badge";
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
    Gamepad2,
    BookOpen,
    LineChart,
    FlaskConical,
    FileText,
    Server,
    Joystick,
} from "lucide-react";

const navLinks = [
    { href: "/", label: "홈", description: "사이트로 돌아가기", icon: <Home size={20} /> },
    { href: "/tags", label: "태그", description: "태그 클라우드 보기", icon: <Layers size={20} /> },
    // 게임은 평탄한 링크가 아니라 gameLinks 2단 드롭다운으로 노출한다. (#49)
];

const myPageLinks = [
    { href: "/dashboard/profile", label: "내 프로필", description: "회원 정보 보기", icon: <User size={20} /> },
    { href: "/dashboard/posts", label: "내가 올린 유머", description: "내가 업로드한 유머 보기", icon: <Archive size={20} /> },
    { href: "/dashboard/settings", label: "설정", description: "내 설정 보기", icon: <Settings size={20} /> },
    { href: "/post/write", label: "유머 업로드", description: "새로운 유머 업로드하기", icon: <Upload size={20} /> },
];

// "게임" 2단 메뉴 (#49) — 게임 ▾ → 게임별 ▸ → 항목.
//   게임이 여러 개가 될 수 있어 게임을 한 단계 두고, 그 아래 플레이와 제작 도구를 묶는다.
//   권한은 항목별: 플레이는 공개, 씬은 로그인(authOnly), 피드백 노트·서버 상태는 owner.
//   따라서 게임 메뉴 자체는 비로그인에게도 보인다(예전 "에테르니아" 드롭다운은 통째로 숨겼다).
//   bevy-rogue 라우트(/games/bevy-rogue)는 라이브 유지하되 navbar 에는 노출하지 않는다(#219).
const gameLinks = [
    {
        key: "web-adventure",
        label: "에테르니아의 추락",
        description: "다크 에픽 CYOA",
        icon: <Gamepad2 size={20} />,
        children: [
            {
                href: "/games/web-adventure",
                label: "플레이",
                description: "게임 시작",
                icon: <Gamepad2 size={20} />,
                authOnly: false,
                ownerOnly: false,
            },
            {
                href: "/scenes",
                label: "씬",
                description: "Web-Adventure 씬 CMS",
                icon: <BookOpen size={20} />,
                authOnly: true,
                ownerOnly: false,
            },
            {
                href: "/scenes/feedback-notes",
                label: "피드백 노트",
                description: "플레이 로그 기반 LLM 작가 노트",
                icon: <FileText size={20} />,
                authOnly: true,
                ownerOnly: true,
            },
            {
                href: "/scenes/status",
                label: "서버 상태",
                description: "로컬 LLM/서버 상태 (읽기 전용)",
                icon: <Server size={20} />,
                authOnly: true,
                ownerOnly: true,
            },
        ],
    },
    {
        // #109 — EmulatorJS 로 도는 고전 게임. 자기가 올린 롬을 다루므로 로그인 전용이다.
        key: "retro",
        label: "고전 게임",
        description: "브라우저에서 바로 즐기는 레트로",
        icon: <Joystick size={20} />,
        children: [
            {
                href: "/games/retro",
                label: "라이브러리",
                description: "홈브류 모음 + 내가 올린 롬",
                icon: <Joystick size={20} />,
                authOnly: true,
                ownerOnly: false,
            },
        ],
    },
];

// owner 전용 hidden "주식" 묶음 — session.user.isOwner 가 true 일 때만 노출.
// 마이페이지 패턴과 동일한 드롭다운 그룹.
const stocksLinks = [
    {
        href: "/admin/stocks",
        label: "종목 차트",
        description: "KOSPI200 / S&P500 / NASDAQ-100 종가 차트",
        icon: <LineChart size={20} />,
    },
    {
        href: "/admin/portfolio",
        label: "매매 차트",
        description: "포트폴리오 시계열 + 매매 마커",
        icon: <LineChart size={20} />,
    },
    {
        href: "/admin/backtest",
        label: "백테스트",
        description: "무한매수 v1 과거 시뮬레이션",
        icon: <FlaskConical size={20} />,
    },
    // owner 전용 설정이라 개인 설정 페이지에서 떼어내 여기 둔다. 마이페이지 설정엔
    // 테마만 남는다. (#47)
    {
        href: "/admin/trading",
        label: "자동매매 설정",
        description: "계좌·전략·실행 시각",
        icon: <Settings size={20} />,
    },
];

export default function Navbar() {
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isStocksDropdownOpen, setIsStocksDropdownOpen] = useState(false);
    const [isGamesDropdownOpen, setIsGamesDropdownOpen] = useState(false);
    // 2단 중첩 — 데스크톱에서 하위 메뉴가 펼쳐진 게임(null 이면 모두 접힘).
    const [openGameKey, setOpenGameKey] = useState<string | null>(null);
    const pathname = usePathname();
    const dropdownRef = useRef<HTMLLIElement>(null);
    const stocksDropdownRef = useRef<HTMLLIElement>(null);
    const gamesDropdownRef = useRef<HTMLLIElement>(null);

    const isGamesGroupActive =
        pathname.startsWith("/games") ||
        pathname === "/scenes" ||
        pathname.startsWith("/scenes/");
    const isStocksGroupActive =
        pathname.startsWith("/admin/stocks") ||
        pathname.startsWith("/admin/portfolio") ||
        pathname.startsWith("/admin/backtest") ||
        pathname.startsWith("/admin/trading");
    const isMyPageActive = pathname === "/post/write" || pathname.startsWith("/dashboard");
    const isOwner = Boolean(session?.user?.isOwner);

    // 모바일 메뉴 내부 collapsible 섹션 상태.
    const [isMobileMyPageOpen, setIsMobileMyPageOpen] = useState<boolean>(isMyPageActive);
    const [isMobileStocksOpen, setIsMobileStocksOpen] = useState<boolean>(isStocksGroupActive);
    const [isMobileGamesOpen, setIsMobileGamesOpen] = useState<boolean>(isGamesGroupActive);
    const [mobileOpenGameKey, setMobileOpenGameKey] = useState<string | null>(
        isGamesGroupActive ? gameLinks[0]?.key ?? null : null,
    );

    // 항목별 권한 필터 — 플레이는 공개, 씬은 로그인, 피드백노트·서버상태는 owner.
    const visibleChildren = (game: (typeof gameLinks)[number]) =>
        game.children.filter(
            (c) => (!c.authOnly || Boolean(session)) && (!c.ownerOnly || isOwner),
        );
    // 보여줄 항목이 하나도 없는 게임은 메뉴에서 뺀다.
    const visibleGames = gameLinks.filter((g) => visibleChildren(g).length > 0);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node;
            if (dropdownRef.current && !dropdownRef.current.contains(target)) {
                setIsDropdownOpen(false);
            }
            if (stocksDropdownRef.current && !stocksDropdownRef.current.contains(target)) {
                setIsStocksDropdownOpen(false);
            }
            if (gamesDropdownRef.current && !gamesDropdownRef.current.contains(target)) {
                setIsGamesDropdownOpen(false);
                setOpenGameKey(null); // 하위 메뉴도 같이 접는다.
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

                {/* 메뉴 + 알림 종을 한 묶음으로 (#243).
                    컨테이너가 justify-between 이라 자식이 넷이면 넷 다 균등하게 벌어져
                    종이 메뉴에서 멀어진다. 묶으면 [로고] ——여백—— [메뉴][종] 이 된다. */}
                <div className="flex items-center gap-4">
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

                    {/* 게임 — 2단 중첩 드롭다운. 게임 ▾ → 게임별 ▸ → 항목 (#49).
                        플레이가 공개라 메뉴 자체는 비로그인에게도 보인다. */}
                    {visibleGames.length > 0 && (
                        <li className="relative" ref={gamesDropdownRef}>
                            <button
                                className={`flex items-center gap-1 transition ${isGamesGroupActive ? "text-gray-400" : "text-gray-500"
                                    } hover:text-gray-300`}
                                onClick={() => setIsGamesDropdownOpen((v) => !v)}
                                aria-label="게임 메뉴"
                            >
                                <Gamepad2 size={20} /> 게임 <ChevronDown size={16} />
                            </button>
                            {isGamesDropdownOpen && (
                                <ul className="absolute right-0 mt-2 w-56 bg-gray-800 shadow-lg rounded-lg z-20 py-1">
                                    {visibleGames.map((game) => {
                                        const children = visibleChildren(game);
                                        // 하위가 하나뿐이면(예: 비로그인 = 플레이만) 펼치는 게 헛클릭이라
                                        // 게임 이름 자체를 그 항목 링크로 만든다. (#51)
                                        const only = children.length === 1 ? children[0] : null;
                                        return (
                                            <li key={game.key} className="relative">
                                                {only ? (
                                                    <Link
                                                        href={only.href}
                                                        className={`px-4 py-2 hover:bg-gray-700 transition flex items-center gap-2 ${pathname === only.href ? "text-gray-400" : "text-gray-300"}`}
                                                        onClick={() => setIsGamesDropdownOpen(false)}
                                                    >
                                                        {game.icon}
                                                        {game.label}
                                                    </Link>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="w-full px-4 py-2 hover:bg-gray-700 transition flex items-center justify-between gap-2 text-left"
                                                            onClick={() =>
                                                                setOpenGameKey((k) => (k === game.key ? null : game.key))
                                                            }
                                                            aria-label={`${game.label} 하위 메뉴`}
                                                            aria-expanded={openGameKey === game.key}
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                {game.icon}
                                                                {game.label}
                                                            </span>
                                                            <ChevronDown
                                                                size={16}
                                                                className={`transition transform ${openGameKey === game.key ? "rotate-180" : ""}`}
                                                            />
                                                        </button>
                                                        {openGameKey === game.key && (
                                                            <ul className="pl-6 border-l border-gray-700 ml-4 my-1 space-y-1">
                                                                {children.map((link) => (
                                                                    <li key={link.href}>
                                                                        <Link
                                                                            href={link.href}
                                                                            className={`px-2 py-2 rounded hover:bg-gray-700 transition flex items-center gap-2 ${pathname === link.href ? "text-gray-400" : "text-gray-300"}`}
                                                                            onClick={() => {
                                                                                setIsGamesDropdownOpen(false);
                                                                                setOpenGameKey(null);
                                                                            }}
                                                                        >
                                                                            {link.icon}
                                                                            {link.label}
                                                                        </Link>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </li>
                    )}

                    {/* 주식 — owner 전용 드롭다운 (종목 차트 + 매매 차트) */}
                    {isOwner && (
                        <li className="relative" ref={stocksDropdownRef}>
                            <button
                                className={`flex items-center gap-1 transition ${isStocksGroupActive ? "text-gray-400" : "text-gray-500"
                                    } hover:text-gray-300`}
                                onClick={() => setIsStocksDropdownOpen((v) => !v)}
                                aria-label="주식 메뉴"
                            >
                                <LineChart size={20} /> 주식 <ChevronDown size={16} />
                            </button>
                            {isStocksDropdownOpen && (
                                <ul className="absolute right-0 mt-2 w-48 bg-gray-800 shadow-lg rounded-lg overflow-hidden z-20">
                                    {stocksLinks.map((link) => (
                                        <li key={link.href}>
                                            <Link
                                                href={link.href}
                                                className="px-4 py-2 hover:bg-gray-700 transition flex items-center gap-1"
                                                onClick={() => setIsStocksDropdownOpen(false)}
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
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
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

                {/* 오늘이 공휴일·기념일·절기면 아이콘 (#328). 해당 없는 날엔 아무것도 안 그린다.
                    로그인 없이도 보인다 — 공휴일은 누구에게나 공휴일이다. */}
                <CalendarBadge />

                {/* 알림 종 (#237) — 데스크탑·모바일 마크업 밖이라 한 번만 넣으면 양쪽에서 보인다.
                    목록은 /notifications 페이지가 그린다(navbar 를 더 키우지 않는다). */}
                <NotificationBell />
                </div>

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

                    {/* 게임 — 모바일 2단 collapsible (#49). 게임 섹션 → 게임별 → 항목.
                        플레이가 공개라 session 블록 밖에 둔다. */}
                    {visibleGames.length > 0 && (
                        <li>
                            <button
                                type="button"
                                className={`w-full py-2 hover:bg-gray-700 transition flex items-center justify-between gap-1 ${isGamesGroupActive ? "text-gray-400" : "text-gray-300"}`}
                                onClick={() => setIsMobileGamesOpen((v) => !v)}
                                aria-label="모바일 게임 섹션 토글"
                                aria-expanded={isMobileGamesOpen}
                            >
                                <span className="flex items-center gap-2">
                                    <Gamepad2 size={20} />
                                    게임
                                </span>
                                <ChevronDown
                                    size={18}
                                    className={`transition transform ${isMobileGamesOpen ? "rotate-180" : ""}`}
                                />
                            </button>
                            {isMobileGamesOpen && (
                                <ul className="pl-4 border-l border-gray-700 ml-2 mt-1 space-y-1">
                                    {visibleGames.map((game) => {
                                        const children = visibleChildren(game);
                                        // 하위가 하나뿐이면 게임 이름이 곧 그 링크. (#51)
                                        const only = children.length === 1 ? children[0] : null;
                                        return (
                                            <li key={game.key}>
                                                {only ? (
                                                    <Link
                                                        href={only.href}
                                                        className={`py-2 px-2 rounded hover:bg-gray-700 transition flex items-center gap-2 ${pathname === only.href ? "text-gray-400" : "text-gray-300"}`}
                                                        onClick={() => setIsOpen(false)}
                                                    >
                                                        {game.icon}
                                                        {game.label}
                                                    </Link>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="w-full py-2 px-2 rounded hover:bg-gray-700 transition flex items-center justify-between gap-1 text-gray-300"
                                                            onClick={() =>
                                                                setMobileOpenGameKey((k) => (k === game.key ? null : game.key))
                                                            }
                                                            aria-label={`모바일 ${game.label} 토글`}
                                                            aria-expanded={mobileOpenGameKey === game.key}
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                {game.icon}
                                                                {game.label}
                                                            </span>
                                                            <ChevronDown
                                                                size={16}
                                                                className={`transition transform ${mobileOpenGameKey === game.key ? "rotate-180" : ""}`}
                                                            />
                                                        </button>
                                                        {mobileOpenGameKey === game.key && (
                                                            <ul className="pl-5 border-l border-gray-700 ml-2 mt-1 space-y-1">
                                                                {children.map((link) => (
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
                                                    </>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </li>
                    )}

                    {/* 로그인 상태에 따라 모바일 메뉴 변경 */}
                    {session ? (
                        <>
                            {/* 주식 — owner 전용 모바일 collapsible 섹션 */}
                            {isOwner && (
                                <li>
                                    <button
                                        type="button"
                                        className={`w-full py-2 hover:bg-gray-700 transition flex items-center justify-between gap-1 ${isStocksGroupActive ? "text-gray-400" : "text-gray-300"}`}
                                        onClick={() => setIsMobileStocksOpen((v) => !v)}
                                        aria-label="모바일 주식 섹션 토글"
                                        aria-expanded={isMobileStocksOpen}
                                    >
                                        <span className="flex items-center gap-2">
                                            <LineChart size={20} />
                                            주식
                                        </span>
                                        <ChevronDown
                                            size={18}
                                            className={`transition transform ${isMobileStocksOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>
                                    {isMobileStocksOpen && (
                                        <ul className="pl-6 border-l border-gray-700 ml-2 mt-1 space-y-1">
                                            {stocksLinks.map((link) => (
                                                <li key={link.href}>
                                                    <Link
                                                        href={link.href}
                                                        className={`py-2 px-2 rounded hover:bg-gray-700 transition flex items-center gap-2 ${pathname.startsWith(link.href) ? "text-gray-400" : "text-gray-300"}`}
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
                            )}

                            {/* 마이페이지 collapsible 섹션 */}
                            <li>
                                <button
                                    type="button"
                                    className={`w-full py-2 hover:bg-gray-700 transition flex items-center justify-between gap-1 ${isMyPageActive ? "text-gray-400" : "text-gray-300"}`}
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
