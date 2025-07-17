'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';
import { useCallback, useEffect, useState } from 'react';

export default function LikeSection({
    defaultLikes,
    _id
}: {
    defaultLikes?: number;
    defaultDislikes?: number;
    _id: string;
}) {
    const [likes, setLikes] = useState(defaultLikes || 0);
    // 좋아요 상태를 관리하기 위한 상태 변수
    const [likeChecked, setLikeChecked] = useState(false);

    const updateLikes = useCallback(async (likeChecked: boolean) => {
        try {
            const postData = {
                _id,
                likeChecked,
            };

            const response = await fetch("/api/like-dislike", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postData),
            });

            console.assert(response.ok, "Response should be ok");
            const { likes } = await response.json();

            setLikes(likes);
            setLikeChecked(likeChecked);
        } catch (error) {
            console.error("Error:", error);
        }
    }, [_id]);


    useEffect(() => {
        // 초기 상태 설정: 로컬 스토리지에서 좋아요 상태를 가져옵니다.
        const likedStatus = parseInt(localStorage.getItem(`liked_${_id}`) || '0');

        setLikeChecked(likedStatus > 0 ? true : false);
    }, [_id]);

    return (
        <div className="flex justify-end items-center text-sm text-gray-600 border-t border-t-gray-200 p-4 gap-4">
            <div className={`flex items-center gap-1.5 cursor-pointer ${likeChecked ? 'text-red-600' : 'hover:text-blue-600'}`}
                onClick={async () => {
                    if (!likeChecked) {
                        await updateLikes(true);
                        localStorage.setItem(`liked_${_id}`, '1');
                    } else {
                        await updateLikes(false);
                        localStorage.removeItem(`liked_${_id}`);
                    }
                }}>
                <FontAwesomeIcon icon={faHeart} size='lg' />
                <span>{likes || 0}</span>
            </div>
        </div>
    );
}
