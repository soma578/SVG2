/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
