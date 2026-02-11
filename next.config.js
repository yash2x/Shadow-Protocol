/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    config.externals.push('pino-pretty', 'encoding');
    return config;
  },
  experimental: {
    serverComponentsExternalPackages: ['snarkjs', 'circomlibjs'],
  },
};

module.exports = nextConfig;
