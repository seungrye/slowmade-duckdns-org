'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faThumbsDown, faThumbsUp } from '@fortawesome/free-solid-svg-icons';
import { useCallback, useEffect, useState } from 'react';

export default function LikeHateSection({
    defaultLikes,
    defaultDislikes,
    _id
}: {
    defaultLikes?: number;
    defaultDislikes?: number;
    _id: string;
}) {
    const [likes, setLikes] = useState(defaultLikes || 0);
    const [dislikes, setDislikes] = useState(defaultDislikes || 0);
    // 좋아요와 싫어요 상태를 관리하기 위한 상태 변수
    const [likeChecked, setLikeChecked] = useState(false);
    const [dislikeChecked, setDislikeChecked] = useState(false);

    const updateLikeDislike = useCallback(async (likeChecked: boolean, dislikeChecked: boolean) => {
        try {
            const postData = {
                _id,
                likeChecked,
                dislikeChecked
            };

            const response = await fetch("/api/like-dislike", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postData),
            });

            console.assert(response.ok, "Response should be ok");
            const { likes, dislikes } = await response.json();

            setLikes(likes);
            setDislikes(dislikes);

            setLikeChecked(likeChecked);
            setDislikeChecked(dislikeChecked);
        } catch (error) {
            console.error("Error:", error);
        }
    }, [_id]);


    useEffect(() => {
        // 초기 상태 설정: 로컬 스토리지에서 좋아요/싫어요 상태를 가져옵니다.
        const likedStatus = parseInt(localStorage.getItem(`liked_${_id}`) || '0');

        setLikeChecked(likedStatus > 0 ? true : false);
        setDislikeChecked(likedStatus < 0 ? true : false);
    }, [_id]);

    return (
        <div className="flex justify-end items-center text-sm text-gray-600 border-t border-t-gray-200 p-4 gap-4">
            <div className={`flex items-center gap-1.5 cursor-pointer ${likeChecked ? 'text-red-600' : 'hover:text-blue-600'}`}
                onClick={async () => {
                    if (likeChecked) return; // 이미 좋아요 상태인 경우 아무 동작도 하지 않음
                    await updateLikeDislike(true, false); // 좋아요 상태로 업데이트
                    localStorage.setItem(`liked_${_id}`, '1');
                }}>
                <FontAwesomeIcon icon={faThumbsUp} size='lg' />
                <span>{likes || 0}</span>
            </div>
            <div className={`flex items-center gap-1.5 cursor-pointer ${dislikeChecked ? 'text-red-600' : 'hover:text-blue-600'}`}
                onClick={async () => {
                    if (dislikeChecked) return; // 이미 싫어요 상태인 경우 아무 동작도 하지 않음
                    await updateLikeDislike(false, true); // 싫어요 상태로 업데이트
                    localStorage.setItem(`liked_${_id}`, '-1');
                }}>
                <FontAwesomeIcon icon={faThumbsDown} size='lg' />
                <span>{dislikes || 0}</span>
            </div>
        </div>
    );
}
