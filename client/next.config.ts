import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Parent folder has its own package-lock.json; without this, Turbopack uses Hackx/ as root
  // and PostCSS cannot resolve tailwindcss from client/node_modules.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
