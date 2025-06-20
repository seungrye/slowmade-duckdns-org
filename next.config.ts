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
