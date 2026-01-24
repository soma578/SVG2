import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ZoomGuard } from '../components/ZoomGuard'

export const metadata: Metadata = {
  title: '岡山防災マップ',
  description: 'SVGMapを使った岡山県内の防災情報マップ',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>
        <ZoomGuard />
        {children}
      </body>
    </html>
  )
}
