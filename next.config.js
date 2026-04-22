const { execSync } = require('child_process')
const { withSentryConfig } = require('@sentry/nextjs')

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
// Sentry wrapper — uploads source maps during `next build` when
// SENTRY_AUTH_TOKEN is present (read from .env.sentry-build-plugin locally
// or set in the EC2 environment). Without a token, the SDK still captures
// errors at runtime; only source-mapped stack traces are unavailable.
module.exports = withSentryConfig(nextConfig, {
  org: 'bijli-bachao-pk',
  project: 'javascript-nextjs',
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress Sentry build-plugin log noise unless we're in CI.
  silent: !process.env.CI,

  // Upload source maps for files in /_next/static so stack traces de-minify.
  widenClientFileUpload: true,

  // Route browser-side Sentry requests through /monitoring to bypass
  // adblockers that target sentry.io directly.
  tunnelRoute: '/monitoring',

  // Skip the upload step entirely when no auth token is present (local dev
  // builds, CI PR builds) — runtime capture still works.
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
})
