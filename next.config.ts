import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse reads test files on init — must not be bundled by webpack
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
