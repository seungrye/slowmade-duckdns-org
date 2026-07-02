import { Suspense } from "react";
import LoginContent from "./login-content";

// 루트 layout 정적화 이후 이 페이지도 prerender 대상이 되므로, useSearchParams(?error=)를
// 쓰는 client 부분을 Suspense boundary 로 감싼다(CSR bailout 방지).
export default function LoginPage() {
    return (
        <Suspense>
            <LoginContent />
        </Suspense>
    );
}
