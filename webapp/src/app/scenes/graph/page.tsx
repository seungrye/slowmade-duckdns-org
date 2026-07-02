import { Suspense } from "react";
import GraphClient from "./graph-client";

// 루트 layout 정적화 이후 이 페이지도 prerender 대상이 되므로, useSearchParams(?focus=)를
// 쓰는 ReactFlow client 부분을 Suspense boundary 로 감싼다(CSR bailout 방지).
export default function ScenesGraphPage() {
    return (
        <Suspense>
            <GraphClient />
        </Suspense>
    );
}
