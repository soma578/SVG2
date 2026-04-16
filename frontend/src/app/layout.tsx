import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ZoomGuard } from '../components/ZoomGuard'
import { ServiceWorkerRegister } from '../components/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: '防災マップシステム',
  description: '防災関連情報および現場の活動状況を地図上で可視化するWebマップ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '防災マップ',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        {/* <ServiceWorkerRegister /> */}
        <ZoomGuard />
        {children}
      </body>
    </html>
  )
}
