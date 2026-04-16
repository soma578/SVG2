const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname),
  },
  outputFileTracingIncludes: {
    '/api/**/*': [
      './public/regions/**/*',
      './public/data/**/*',
      './public/search-index/**/*',
    ],
  },
  // SVGMapファイルへのアクセスを許可
  async rewrites() {
    return [
      {
        source: '/svgmap/:path*',
        destination: '/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
