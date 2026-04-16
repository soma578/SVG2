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
            防災マップシステムは、防災関連情報および現場の活動状況を地図上で直感的に可視化するWebマップです。
          </p>
          <p className="text-gray-600 mb-4">
            3つの主要レイヤーを中心に構成されています。
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
            <li><strong>L1 ベースエリア</strong>: 自治体境界、地区境界、区域情報</li>
            <li><strong>L2 避難所</strong>: 施設名、住所、収容人数、開設状況などの属性情報を含む避難所データ</li>
            <li><strong>L3 チーム活動</strong>: 支援チームの位置、活動種別、状態</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            地図エンジン
          </h2>
          <p className="text-gray-600 mb-4">
            2つの地図エンジンを切り替えて利用できます。
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
            <li><strong>SVGMap</strong>: SVGMap.jsのハイパーレイヤリング技術を活用したiframe runtime</li>
            <li><strong>MapLibre</strong>: MapLibre GL JSによるReactネイティブ描画</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            データ出典
          </h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>ベースマップ: 国土地理院タイル</li>
            <li>避難所データ: 自治体オープンデータ</li>
            <li>行政境界: 国土数値情報 行政区域データ</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            技術スタック
          </h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>フロントエンド: Next.js + TypeScript</li>
            <li>地図エンジン: SVGMap.js / MapLibre GL JS</li>
            <li>スタイリング: Tailwind CSS</li>
            <li>データ取込: CSV / Excel (.xlsx)</li>
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
