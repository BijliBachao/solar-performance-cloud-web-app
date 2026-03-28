const { execSync } = require('child_process')

/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: async () => {
    try {
      return execSync('git rev-parse --short HEAD').toString().trim()
    } catch {
      return `build-${Date.now()}`
    }
  },
  images: {
    domains: ['localhost', 'img.clerk.com'],
  },
  webpack: (config, { isServer, dev }) => {
    if (!isServer && !dev) {
      config.optimization = {
        ...config.optimization,
        innerGraph: false,
        usedExports: false,
        splitChunks: {
          ...config.optimization.splitChunks,
          cacheGroups: {
            ...config.optimization.splitChunks?.cacheGroups,
            default: false,
          },
        },
      }
    }
    return config
  },
}
module.exports = nextConfig
