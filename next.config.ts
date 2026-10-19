import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Exposes TEST_MODE from .env to the browser bundle. Read at startup: restart `npm run dev` after changing it.
  env: {
    TEST_MODE: String(process.env.TEST_MODE ?? "false").trim().toLowerCase() === "true" ? "true" : "false",
  },
};

export default nextConfig;
