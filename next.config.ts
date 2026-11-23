import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  // The home page is the discharge list; the old route names still work.
  redirects: () => [
    { source: "/", destination: "/discharges", permanent: false },
    { source: "/discharged", destination: "/discharges", permanent: true },
    { source: "/ward", destination: "/charts", permanent: true },
    { source: "/ward/:an/audit", destination: "/charts/:an/query", permanent: true },
    { source: "/ward/:an", destination: "/charts/:an/coding", permanent: true },
    // the chart audit became step 1 (Pre-coding + Query), the D/C summary step 2 (Complete coding)
    { source: "/charts/:an/audit", destination: "/charts/:an/query", permanent: true },
    { source: "/charts/:an/discharge-summary", destination: "/charts/:an/coding", permanent: true },
  ],
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
