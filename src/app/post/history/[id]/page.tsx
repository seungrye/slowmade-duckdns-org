'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface Revision {
    _id: string;
    version: number;
    title: string;
    author?: string;
    createdAt: string;
}

export default function PostHistoryPage() {
    const params = useParams();
    const router = useRouter();
    const postId = params.id as string;

    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!postId) return;

        const fetchRevisions = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/post/revisions?postId=${postId}`);
                if (!res.ok) {
                    throw new Error('Failed to fetch revisions');
                }
                const data = await res.json();
                setRevisions(data);
            } catch (error) {
                console.error(error);
                toast.error('게시글의 변경 이력을 불러오는 데 실패했습니다.');
                router.push(`/post/view/${postId}`);
            } finally {
                setLoading(false);
            }
        };

        fetchRevisions();
    }, [postId, router]);

    if (loading) {
        return <div className="mx-auto p-4">로딩 중...</div>;
    }

    return (
        <div className="mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold mb-4">게시글 변경 이력</h1>
            <p className="mb-6 text-gray-600">
                <Link href={`/post/view/${postId}`} className="text-blue-500 hover:text-blue-700">
                    &larr; 현재 게시글로 돌아가기
                </Link>
            </p>

            {revisions.length > 0 ? (
                <ul className="border border-gray-200 rounded-lg">
                    {revisions.map((revision, index) => (
                        <li key={revision._id} className={`p-4 ${index < revisions.length - 1 ? 'border-b border-gray-200' : ''}`}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="font-semibold text-lg">버전 {revision.version}</span>
                                    <p className="text-gray-800">{revision.title}</p>
                                </div>
                                <div className="text-right text-sm text-gray-500">
                                    <p>{revision.author || '알 수 없음'}</p>
                                    <p>{new Date(revision.createdAt).toLocaleString()}</p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p>변경 이력이 없습니다.</p>
            )}
        </div>
    );
}