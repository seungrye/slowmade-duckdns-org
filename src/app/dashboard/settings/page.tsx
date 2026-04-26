'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useSession } from 'next-auth/react';

type Theme = 'light' | 'dark' | 'system';

/**
 * 설정 폼을 렌더링하고, 설정 값을 불러오고 저장하는 로직을 담당합니다.
 */
function SettingsForm() {
    const [theme, setTheme] = useState<Theme>('system');
    const [initialTheme, setInitialTheme] = useState<Theme>('system');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState('');

    // 컴포넌트가 마운트될 때 현재 사용자 설정을 불러옵니다.
    useEffect(() => {
        fetch('/api/user/settings')
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch settings');
                return res.json();
            })
            .then(data => {
                if (data.theme) {
                    setTheme(data.theme);
                    setInitialTheme(data.theme);
                }
            })
            .catch(err => {
                console.error('Failed to fetch settings:', err);
                setMessage('설정을 불러오는 데 실패했습니다.');
            })
            .finally(() => setIsLoading(false));
    }, []);

    // '저장' 버튼을 클릭했을 때 실행될 함수
    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage('');

        try {
            const res = await fetch('/api/user/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Failed to save settings');
            }

            const savedSettings = await res.json();
            setInitialTheme(savedSettings.theme); // 저장 후 현재 상태를 초기 상태로 업데이트
            setMessage('✅ 설정이 저장되었습니다.');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
            setMessage(`❌ 설정 저장에 실패했습니다: ${errorMessage}`);
        } finally {
            setIsSaving(false);
            setTimeout(() => setMessage(''), 3000); // 3초 후 메시지 숨김
        }
    };

    // 데이터를 불러오는 동안 로딩 스켈레톤 UI를 보여줍니다.
    if (isLoading) {
        return (
            <div className="bg-white p-6 rounded-lg shadow animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-full mb-4"></div>
                <div className="space-y-3 mt-6">
                    <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                </div>
                <div className="mt-8 h-10 bg-gray-200 rounded w-28"></div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2 text-gray-800">테마 설정</h2>
                <p className="text-sm text-gray-600 mb-4">
                    사이트의 전체적인 테마를 선택합니다. &apos;시스템&apos;은 기기의 설정을 따릅니다.
                </p>
                <div className="space-x-3 flex flex-row items-center">
                    {(['light', 'dark', 'system'] as const).map((value) => (
                        <label key={value} className="flex items-center cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                            <input
                                type="radio"
                                name="theme"
                                value={value}
                                checked={theme === value}
                                onChange={() => setTheme(value)}
                                className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500 focus:ring-2"
                            />
                            <span className="ml-3 text-gray-700 capitalize">{value === 'light' ? '라이트' : value === 'dark' ? '다크' : '시스템'}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-between mt-8">
                <button
                    type="submit"
                    disabled={isSaving || theme === initialTheme}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isSaving ? '저장 중...' : '변경사항 저장'}
                </button>
                {message && <p className={`text-sm font-medium ${message.includes('❌') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>}
            </div>
        </form>
    );
}

/**
 * 로그인 상태를 확인하고 설정 페이지의 기본 레이아웃을 제공합니다.
 */
export default function SettingsPage() {
    // `required: true` 옵션은 로그인되지 않은 사용자를 자동으로 로그인 페이지로 리디렉션합니다.
    const { status } = useSession({ required: true });

    // 세션을 확인하는 동안 로딩 상태를 보여줍니다.
    if (status === 'loading') {
        return (
            <main className="mx-auto px-4 py-6">
                <div className="h-8 bg-gray-200 rounded w-32 mb-6 animate-pulse"></div>
                <div className="h-64 bg-gray-200 rounded-lg animate-pulse"></div>
            </main>
        );
    }

    return (
        <main className="mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold mb-6 text-gray-900">설정</h1>
            <SettingsForm />
        </main>
    );
}