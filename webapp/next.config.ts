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
};

export default nextConfig;
