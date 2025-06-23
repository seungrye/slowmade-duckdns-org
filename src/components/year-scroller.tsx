'use client';

import { useEffect, useRef, useState } from 'react';

export default function YearScroller({ uniqueYears, focusYear }: { uniqueYears: number[], focusYear: number }) {
    const containerRef = useRef<HTMLUListElement>(null);
    const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
    const [isScrollable, setIsScrollable] = useState(false);

    useEffect(() => {
        if (containerRef.current) {
            const { scrollWidth, clientWidth } = containerRef.current;
            setIsScrollable(scrollWidth > clientWidth);
          }

        const closestYear = uniqueYears.reduce((closest, year) =>
            Math.abs(year - focusYear) < Math.abs(closest - focusYear) ? year : closest
            , uniqueYears[0]);

        const index = uniqueYears.findIndex((y) => y === closestYear);
        const targetItem = itemRefs.current[index];

        if (targetItem && containerRef.current) {
            const container = containerRef.current;
            const containerRect = container.getBoundingClientRect();
            const itemRect = targetItem.getBoundingClientRect();

            const scrollLeft =
                container.scrollLeft + itemRect.left - containerRect.left - containerRect.width / 2 + itemRect.width / 2;

            container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    }, [focusYear, uniqueYears]);

    return (
        <section className="text-center py-6">
            <ul
                ref={containerRef}
                className={`flex gap-4 md:gap-6 lg:gap-8 overflow-x-auto whitespace-nowrap scrollbar-hide transition-all duration-300 ${
                    isScrollable ? 'justify-start' : 'justify-center'
                  }`}
            >
                {uniqueYears.map((year, idx) => (
                    <li
                        key={year}
                        ref={(el) => {
                            itemRefs.current[idx] = el;
                        }}
                        className="transition duration-300 transform hover:scale-150 shrink-0"
                    >
                        <a
                            href={`?year=${year}`}
                            className="font-serif text-2xl font-bold text-black lg:text-gray-500 px-2 py-1 hover:text-black"
                        >
                            {year}
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
