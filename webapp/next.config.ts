import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deploy and CI builds leave NEXT_DISTDIR unset -> the default '.next' -> .next/cache is reused.
  // dev separates it per port (.next-3010 and so on).
  distDir: process.env.NEXT_DISTDIR ?? '.next',
  // The X-Powered-By: Next.js header is removed - so the framework is not disclosed (security).
  poweredByHeader: false,
  // A light, self-contained server bundle -> a smaller deploy artefact and a better cold start.
  output: 'standalone',
  // Linting is separated from the build (run as `pnpm run lint` or in CI) -> a faster build.
  // Type checking stays in the build (typescript.ignoreBuildErrors is never turned on).
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
        // The main domain's apex path - the new image URL (MINIO_PUBLIC_HOST=handmade.r-e.kr/s3).
        protocol: 'https',
        hostname: 'handmade.r-e.kr',
        port: '',
        pathname: '/s3/**',
        search: '',
      },
      {
        // Backwards compatibility with the old slowmade apex path (removable once the migration is done).
        protocol: 'https',
        hostname: 'slowmade.duckdns.org',
        port: '',
        pathname: '/s3/**',
        search: '',
      },
      {
        // Backwards compatibility with the old image URLs (removable once the migration is done).
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
