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
    { source: "/ward/:an/audit", destination: "/charts/:an/audit", permanent: true },
    { source: "/ward/:an", destination: "/charts/:an/discharge-summary", permanent: true },
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
