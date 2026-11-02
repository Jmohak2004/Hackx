import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/index.html", destination: "/arena", permanent: true }];
  },
  async rewrites() {
    const backend = (process.env.SERVER_API_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
    return [{ source: "/api/backend/:path*", destination: backend + "/:path*" }];
  },
  // Parent folder has its own package-lock.json; without this, Turbopack uses Hackx/ as root
  // and PostCSS cannot resolve tailwindcss from client/node_modules.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
