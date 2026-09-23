import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: __dirname,
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
