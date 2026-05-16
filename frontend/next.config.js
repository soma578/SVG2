/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        // マップデータ JSON — 5分キャッシュ、バックグラウンド再検証
        source: '/map/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=60' },
        ],
      },
      {
        // WebApp HTML / SVG コンテナ — 1時間キャッシュ
        source: '/map/webapp/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=300' },
        ],
      },
      {
        // アイコン / 地域境界 SVG — 1日キャッシュ
        source: '/map/icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=3600' },
        ],
      },
      {
        source: '/map/regions/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=3600' },
        ],
      },
      {
        source: '/map/containers/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=300' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
