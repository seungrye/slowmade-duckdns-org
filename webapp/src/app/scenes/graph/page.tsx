import { Suspense } from "react";
import GraphClient from "./graph-client";

// Since the root layout became static this page is prerendered too, so the ReactFlow client part using
// useSearchParams (?focus=) is wrapped in a Suspense boundary (avoiding a CSR bailout).
export default function ScenesGraphPage() {
    return (
        <Suspense>
            <GraphClient />
        </Suspense>
    );
}
