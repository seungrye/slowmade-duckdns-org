import { Suspense } from "react";
import LoginContent from "./login-content";

// Since the root layout became static this page is prerendered too, so the client part using
// useSearchParams (?error=) is wrapped in a Suspense boundary (avoiding a CSR bailout).
export default function LoginPage() {
    return (
        <Suspense>
            <LoginContent />
        </Suspense>
    );
}
