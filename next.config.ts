import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/simulation-toolkit',
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
