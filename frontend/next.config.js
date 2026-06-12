/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  turbopack: {
    root: __dirname,
  },
  // Server routes read source-of-truth files from ../map at runtime (region index,
  // per-layer publish configs). Trace them into the serverless bundle so Vercel includes
  // them. Paths are relative to this config's directory (frontend/).
  outputFileTracingIncludes: {
    '/api/republish': ['../map/regions/**', '../map/layers/managed/**'],
    '/api/map/**': ['../map/regions/**'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), interest-cohort=()' },
        ],
      },
      {
        // マップデータ JSON — 5分キャッシュ、バックグラウンド再検証
        source: '/map/data/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=60' },
        ],
      },
      {
        // WebApp HTML / JS / レイヤーSVG = コード。長期キャッシュするとデプロイと実態が乖離する
        // （SVGMap の disableCacheQuery は controller HTML にしか効かず、ES module import や
        //   レイヤーSVG は古いまま残る）。ETag 再検証(304)なので実コストはほぼゼロ。
        source: '/map/webapp/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, no-cache' },
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
        // runtime-config / municipalities = 設定。publish や設定変更が即反映されるべき
        source: '/map/regions/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, no-cache' },
        ],
      },
      {
        // コンテナSVG = 生成された設定ファイル。レイヤー構成変更が即反映されるべき
        source: '/map/containers/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, no-cache' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
