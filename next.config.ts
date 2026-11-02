import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite'],
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '*.dev.coze.site',
    ...(process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
      ? [`${process.env.CODESPACE_NAME}-${process.env.DEPLOY_RUN_PORT || '5000'}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`]
      : []),
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
