"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function InputSearch({ current }: { current: string }) {
    const router = useRouter();
    const [query, setQuery] = useState(current);

    const handleSearch = () => {
        router.replace(`?query=${encodeURIComponent(query)}`);
    };

    return (
        <div className="flex">
            <Input
                type="text"
                placeholder="유머 제목 또는 키워드 입력..."
                defaultValue={query}
                onChange={(e) => setQuery(e.target.value)}
                className="rounded-r-none w-80"
            />
            <Button
                onClick={handleSearch}
                className="rounded-l-none"
                aria-label="검색"
            >
                검색
            </Button>
        </div>
    );
}
