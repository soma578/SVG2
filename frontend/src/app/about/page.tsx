import Layout from '@/components/Layout'

export default function About() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          このサイトについて
        </h1>

        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            システム概要
          </h2>
          <p className="text-gray-600 mb-4">
            岡山防災マップシステムは、岡山県内（特に岡山市周辺）の住民・関係者に対して、
            避難所・ハザード情報を一元的に閲覧できるWebマップを提供します。
          </p>
          <p className="text-gray-600">
            SVGMapのハイパーレイヤリング技術を用いて、国・岡山県・岡山市・研究室など
            複数ソースの地図レイヤを一画面に統合表示します。
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            データ出典
          </h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>ベースマップ: 国土地理院タイル</li>
            <li>避難所データ: 岡山市・岡山県オープンデータ</li>
            <li>ハザード情報: 岡山県公開データ</li>
            <li>気象情報: Open-Meteo API</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            技術スタック
          </h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>フロントエンド: Next.js + TypeScript</li>
            <li>地図エンジン: SVGMap.js</li>
            <li>スタイリング: Tailwind CSS</li>
            <li>データフォーマット: CSV, SVG</li>
          </ul>
        </div>

        <div className="mt-8 bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <p className="text-sm text-gray-700">
            <strong>注意:</strong> このシステムは研究・実験用途として開発されています。
            実際の防災活動においては、必ず公式の情報源もご確認ください。
          </p>
        </div>
      </div>
    </Layout>
  )
}
