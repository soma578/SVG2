const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: path.join(__dirname),
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
