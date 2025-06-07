import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
    allowedDevOrigins: [
      'http://localhost:3010',
      'http://192.168.0.11:3010',
      'http://127.0.0.1:3010',
      'https://slowmade.duckdns.org'
    ],
  images: {
    domains: [
      'minio-api.slowmade.duckdns.org'
    ], // ← 여기에 도메인 추가
  },
};

export default nextConfig;
