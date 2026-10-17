/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig = {
  // Lets the E2E server run alongside `next dev` without sharing build output.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // Native / heavy server-only packages stay out of the server bundle.
  serverExternalPackages: ['@node-rs/argon2', 'unpdf', 'mammoth', '@prisma/client'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack: (config, { isServer }) => {
    // react-pdf / pdf.js optionally require `canvas` in Node; it is never used in the browser build.
    config.resolve.alias.canvas = false;
    if (!isServer) {
      // pdf.js ships a pre-bundled `pdf.mjs` whose top-level `__webpack_require__`
      // / `__webpack_exports__` variables collide with webpack's own module
      // wrapper in development. The minified build has no such identifiers.
      config.resolve.alias['pdfjs-dist$'] = 'pdfjs-dist/build/pdf.min.mjs';
    }
    return config;
  },
};

export default nextConfig;
