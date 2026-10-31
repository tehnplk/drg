import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its wasm/data files from node_modules at runtime
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
