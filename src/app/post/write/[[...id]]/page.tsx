import React from 'react';
import '@/app/post/write/[[...id]]/page.css';
import { Toaster } from "react-hot-toast"; // ✅ 토스트 추가
import type { Metadata } from 'next';
import PostWriterForm from './writer-form';

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: 'Handmade Site - Write Post',
        description: 'Write Post using Rich Web Editor',
    };
}

export default function PostWriter() {
    return (<div className='mx-auto px-4 py-6'>        
        <Toaster position="bottom-right" /> {/* ✅ 토스트 메시지 표시 위치 */}

        <PostWriterForm />
    </div>
    );
}
