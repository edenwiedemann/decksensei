import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  allowedDevOrigins: ["*.replit.dev", "*.janeway.replit.dev"],
};

export default nextConfig;
