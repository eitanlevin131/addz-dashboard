import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // Vercel's Node 22 builders intermittently fail inside webpack's WASM
    // xxhash implementation. A native crypto hash keeps builds deterministic.
    config.output.hashFunction = "sha256";
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
