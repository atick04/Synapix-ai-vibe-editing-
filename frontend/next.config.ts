import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.0.106", "192.168.0.107", "172.20.96.1"],
  async rewrites() {
    const backendPort = process.env.BACKEND_PORT || "8000";
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${backendPort}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `http://127.0.0.1:${backendPort}/uploads/:path*`,
      },
      {
        source: "/assets/:path*",
        destination: `http://127.0.0.1:${backendPort}/assets/:path*`,
      }
    ];
  },
};

export default nextConfig;
