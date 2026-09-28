import path from "node:path";
import type { NextConfig } from "next";

// The monorepo root. Plugin packages live outside apps/web.
const root = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@eaiku/core", "@eaiku/plugin-catat"],
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingRoot: root,
  turbopack: { root },
};

export default nextConfig;
