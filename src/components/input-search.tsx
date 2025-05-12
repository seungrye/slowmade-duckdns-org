"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function InputSearch({ current }: { current: string }) {
    const router = useRouter();
    const [query, setQuery] = useState(current);

    const handleSearch = () => {
        router.replace(`?query=${encodeURIComponent(query)}`);
    };

    return (<><input
        type="text"
        className="border border-gray-300 px-4 py-2 rounded-l-md w-80"
        placeholder="유머 제목 또는 키워드 입력..."
        defaultValue={query}
        onChange={(e) => setQuery(e.target.value)}
    />
        <button
            className="bg-blue-500 text-white px-4 py-2 rounded-r-md hover:bg-blue-600 transition"
            onClick={handleSearch}
        >
            검색
        </button>
    </>
    );
}
