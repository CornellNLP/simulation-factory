import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['firebase-admin'],
  // the old landing page and its toolkit are off; send visitors to the competition page
  async redirects() {
    return [
      { source: '/', destination: '/competition', permanent: false },
      { source: '/mediator', destination: '/competition', permanent: false },
    ]
  },
};

export default nextConfig;
