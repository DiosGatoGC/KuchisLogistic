import type { NextConfig } from "next";
import path from "node:path";

const monorepoRoot = path.join(process.cwd(), "../..");

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: false,
  },
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
