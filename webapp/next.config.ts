import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 배포/CI 빌드는 NEXT_DISTDIR 미설정 → 기본 '.next' 사용 → .next/cache 재사용.
  // dev 는 포트별 distDir(.next-3010 등)로 분리.
  distDir: process.env.NEXT_DISTDIR ?? '.next',
  // 경량 서버 번들(self-contained) 출력 → 배포 아티팩트 축소·콜드스타트 개선.
  output: 'standalone',
  // lint 는 빌드에서 분리(별도 `pnpm run lint` / CI 로 실행) → 빌드 가속.
  // 타입 체크는 빌드에 유지(typescript.ignoreBuildErrors 는 켜지 않음).
  eslint: {
    ignoreDuringBuilds: true,
  },
    allowedDevOrigins: [
      'http://localhost:3010',
      'http://192.168.0.11:3010',
      'http://127.0.0.1:3010',
      'slowmade.duckdns.org',
      '*.slowmade.duckdns.org',
    ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'minio-api.slowmade.duckdns.org',
        port: '',
        pathname: '/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        port: '',
        pathname: '/**',
        search: '',
      },
    ],
  },
  // #248 — mermaid v9 의 mindmap 다이어그램 모듈이 `cytoscape/dist/cytoscape.umd.js` 를
  //   ESM import 시도하지만 cytoscape 3.34 의 exports field 가 그 경로의 import 키를
  //   노출 안 함 → 빌드 실패. mindmap 은 우리 안 씀 (그릴 일 없음) — alias false 로 무시.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...config.resolve.alias,
      'cytoscape/dist/cytoscape.umd.js': false,
    };
    return config;
  },
};

export default nextConfig;
