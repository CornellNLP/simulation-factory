import type { NextConfig } from "next";

// The Mediator and Agent Assistant toolkits were renamed to Public Assistant and
// Private Assistant; the old paths stay reachable for links already shared.
const RENAMED_PATHS: [string, string][] = [
  ['/mediator', '/public-assistant'],
  ['/login/mediator', '/login/public-assistant'],
  ['/class/mediator', '/class/public-assistant'],
  ['/assistant', '/private-assistant'],
  ['/assistant-reddit', '/private-assistant-reddit'],
  ['/assistant-wp', '/private-assistant-wp'],
  ['/login/assistant-reddit', '/login/private-assistant-reddit'],
  ['/login/assistant-wp', '/login/private-assistant-wp'],
];

const nextConfig: NextConfig = {
  basePath: '/simulation-factory',
  serverExternalPackages: ['firebase-admin'],
  async redirects() {
    return RENAMED_PATHS.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
