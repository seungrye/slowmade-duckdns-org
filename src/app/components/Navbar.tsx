"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
];

const contactLinks = [
  { href: "/contact/email", label: "Email Us" },
  { href: "/contact/phone", label: "Call Us" },
  { href: "/contact/address", label: "Visit Us" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLLIElement>(null);

  // 바깥 클릭 시 드롭다운 닫기
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
        <Link href={navLinks[0].href} className="text-2xl font-bold">
          Handmade Site
        </Link>

        {/* 데스크탑 메뉴 */}
        <ul className="hidden md:flex space-x-6 items-center">
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

          {/* Contact 메뉴 (드롭다운) */}
          <li className="relative" ref={dropdownRef}>
            <button
              className="flex items-center gap-1 text-gray-300 hover:text-blue-400 transition"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              Contact <ChevronDown size={16} />
            </button>

            {isDropdownOpen && (
              <ul className="absolute left-0 mt-2 w-40 bg-gray-800 shadow-lg rounded-lg overflow-hidden">
                {contactLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block px-4 py-2 hover:bg-gray-700 transition"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>

        {/* 모바일 메뉴 버튼 */}
        <button className="md:hidden text-white" onClick={() => setIsOpen(!isOpen)}>
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

          {/* Contact (드롭다운) */}
          <li className="text-center">
            <button
              className="block w-full py-2 text-gray-300 hover:text-blue-400 transition"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              Contact
            </button>
            {isDropdownOpen && (
              <ul className="bg-gray-700 space-y-1">
                {contactLinks.map((link) => (
                  <li key={link.href}
                    onClick={() => {
                        setIsDropdownOpen(false);
                        setIsOpen(false);
                    }}
                  >
                    <Link
                      href={link.href}
                      className="block py-2 hover:bg-gray-600 transition"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
