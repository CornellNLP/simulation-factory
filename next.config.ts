import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: 'simulation-factory',
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
