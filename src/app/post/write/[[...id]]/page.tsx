import React from 'react';
import { Toaster } from "react-hot-toast"; // ✅ 토스트 추가
import type { Metadata } from 'next';
import PostWriterForm from './writer-form.section';

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: 'Handmade Site - Write Post',
        description: 'Write Post using Rich Web Editor',
    };
}

export default function PostWriter() {
    return (<div className='px-4 py-6 flex-1 flex flex-col'>
        <Toaster position="bottom-right" /> {/* ✅ 토스트 메시지 표시 위치 */}

        <PostWriterForm />
    </div>
    );
}
