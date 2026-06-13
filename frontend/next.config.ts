import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.0.106", "192.168.0.107", "172.20.96.1"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://127.0.0.1:8000/uploads/:path*",
      },
      {
        source: "/assets/:path*",
        destination: "http://127.0.0.1:8000/assets/:path*",
      }
    ];
  },
};

export default nextConfig;
