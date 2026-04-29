"use client";

import { SORT_LABELS, SortOption } from "@/lib/sort";
import { useRouter } from "next/navigation";

export default function SelectSorter({ current }: { current: string }) {
    const router = useRouter();

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newSort = e.target.value;
        router.replace(`?sort=${newSort}`);
    };

    return (
        <select
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            defaultValue={current}
            onChange={handleChange}
        >
            {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
            ))}
        </select>
    );
}
