import type { NextConfig } from "next";
import path from "node:path";

import {
  LOGISTICS_SECURITY_HEADERS,
  SERVICE_WORKER_HEADERS,
} from "./src/lib/readiness/security-headers";

const monorepoRoot = path.join(process.cwd(), "../..");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [...LOGISTICS_SECURITY_HEADERS],
      },
      {
        source: "/sw.js",
        headers: [...SERVICE_WORKER_HEADERS],
      },
    ];
  },
  experimental: {
    useTypeScriptCli: false,
  },
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
