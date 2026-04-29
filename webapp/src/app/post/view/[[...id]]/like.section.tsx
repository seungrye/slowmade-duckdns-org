'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export default function LikeSection({
    defaultLikes,
    _id
}: {
    defaultLikes?: number;
    defaultDislikes?: number;
    _id: string;
}) {
    const { data: session } = useSession();
    const [likes, setLikes] = useState(defaultLikes || 0);
    const [likeChecked, setLikeChecked] = useState(false);

    useEffect(() => {
        if (session?.user?.email) {
            fetch(`/api/like-dislike?postId=${_id}`)
                .then(r => r.json())
                .then(({ data }) => setLikeChecked(data.isLiked))
                .catch(() => {
                    // DB 조회 실패 시 localStorage fallback
                    const likedStatus = parseInt(localStorage.getItem(`liked_${_id}`) || '0');
                    setLikeChecked(likedStatus > 0);
                });
        } else {
            const likedStatus = parseInt(localStorage.getItem(`liked_${_id}`) || '0');
            setLikeChecked(likedStatus > 0);
        }
    }, [_id, session]);

    const updateLikes = useCallback(async (likeChecked: boolean) => {
        try {
            const response = await fetch("/api/like-dislike", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    _id,
                    likeChecked,
                    userEmail: session?.user?.email ?? null,
                }),
            });

            if (!response.ok) return;
            const { data: { likes } } = await response.json();

            setLikes(likes);
            setLikeChecked(likeChecked);

            // 비로그인 사용자는 localStorage에도 저장
            if (!session?.user?.email) {
                if (likeChecked) {
                    localStorage.setItem(`liked_${_id}`, '1');
                } else {
                    localStorage.removeItem(`liked_${_id}`);
                }
            }
        } catch (error) {
            console.error("Error:", error);
        }
    }, [_id, session]);

    return (
        <div className="flex justify-end items-center text-sm text-gray-600 dark:text-gray-400 border-t border-t-gray-200 dark:border-t-gray-700 p-4 gap-4">
            <div className={`flex items-center gap-1.5 cursor-pointer ${likeChecked ? 'text-red-600' : 'hover:text-blue-600'}`}
                onClick={() => updateLikes(!likeChecked)}>
                <FontAwesomeIcon icon={faHeart} size='lg' />
                <span>{likes || 0}</span>
            </div>
        </div>
    );
}
