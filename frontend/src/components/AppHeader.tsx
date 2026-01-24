import Link from 'next/link'

export default function AppHeader() {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-gray-900">
              岡山防災マップ
            </Link>
          </div>
          <nav className="flex space-x-8">
            <Link
              href="/"
              className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium"
            >
              ホーム
            </Link>
            <Link
              href="/map"
              className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium"
            >
              防災マップ
            </Link>
            <Link
              href="/about"
              className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium"
            >
              このサイトについて
            </Link>
            <Link
              href="/admin/login"
              className="text-gray-700 hover:text-gray-900 px-3 py-2 text-sm font-medium"
            >
              管理
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
