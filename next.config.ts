import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/design-system.html" }],
    };
  },
};

export default nextConfig;
