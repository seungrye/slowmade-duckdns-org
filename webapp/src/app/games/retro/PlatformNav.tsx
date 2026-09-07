"use client";

import { PLATFORMS } from "@/lib/retro/platforms";
import type { PlatformCounts, PlatformFilter } from "@/lib/retro/filter";

interface Props {
  value: PlatformFilter;
  counts: PlatformCounts;
  onChange: (next: PlatformFilter) => void;
  /**
   * sidebar - the vertical desktop list. chips - a horizontal scroll on mobile.
   *
   * The screen width is not detected in JS; both are rendered and CSS shows one. Using matchMedia would diverge
   * from the server render and make the first paint jump.
   */
  variant: "sidebar" | "chips";
}

const ITEMS: { id: PlatformFilter; label: string }[] = [
  { id: "all", label: "전체" },
  ...PLATFORMS.map((p) => ({ id: p.id as PlatformFilter, label: p.label })),
];

export default function PlatformNav({ value, counts, onChange, variant }: Props) {
  if (variant === "chips") {
    return (
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden" role="tablist" aria-label="기종">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={value === item.id}
            onClick={() => onChange(item.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
              value === item.id
                ? "border-blue-500 bg-blue-500 text-white"
                : "border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {item.label}
            <span className="ml-1.5 text-xs opacity-70">{counts[item.id] ?? 0}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <nav className="hidden md:block" aria-label="기종">
      <ul className="space-y-1">
        {ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              aria-current={value === item.id ? "true" : undefined}
              onClick={() => onChange(item.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                value === item.id
                  ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              <span>{item.label}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{counts[item.id] ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
