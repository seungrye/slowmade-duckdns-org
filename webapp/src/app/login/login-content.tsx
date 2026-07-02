"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";

export default function LoginContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get("error");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (error) {
            setErrorMessage("로그인 중 오류가 발생했습니다. 다시 시도해 주세요.");
        }
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="p-8 w-96">
                {errorMessage && (
                    <p className="text-red-500 text-center mb-4">{errorMessage}</p>
                )}

                <button
                    onClick={() => {
                        signIn("google", { callbackUrl: "/" }); // 로그인 후 홈으로 이동
                    }}
                    className="flex items-center justify-center w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 shadow-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition mb-3"
                    aria-label="Google 로그인"
                >
                    <FcGoogle size={20} className="mr-2" />
                    Google 계정으로 로그인
                </button>

                <button
                    onClick={() => signIn("github")}
                    className="flex items-center justify-center w-full bg-gray-900 text-white rounded-lg px-4 py-2 shadow-sm hover:bg-gray-800 transition"
                    aria-label="GitHub 로그인"
                >
                    <FaGithub size={20} className="mr-2" />
                    GitHub 계정으로 로그인
                </button>
            </div>
        </div>
    );
}
