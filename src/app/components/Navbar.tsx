"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="bg-gray-900 text-white shadow-lg">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        {/* 로고 */}
        <Link href="/" className="text-2xl font-bold">
          Handmade Site
        </Link>

        {/* 데스크탑 메뉴 */}
        <ul className="hidden md:flex space-x-6">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`${
                  pathname === link.href ? "text-blue-400" : "text-gray-300"
                } hover:text-blue-400 transition`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* 모바일 메뉴 버튼 */}
        <button
          className="md:hidden text-white"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* 모바일 메뉴 */}
      {isOpen && (
        <ul className="md:hidden bg-gray-800 space-y-2 py-2">
          {navLinks.map((link) => (
            <li key={link.href} className="text-center">
              <Link
                href={link.href}
                className={`block py-2 ${
                  pathname === link.href ? "text-blue-400" : "text-gray-300"
                } hover:text-blue-400 transition`}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
