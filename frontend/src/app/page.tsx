import Layout from '@/components/Layout'
import Link from 'next/link'

export default function Home() {
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            防災マップシステム
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            防災関連情報および現場の活動状況を、地図上で直感的に可視化するWebマップ
          </p>
          <Link
            href="/map"
            className="inline-block bg-primary hover:bg-primary-dark text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
          >
            マップを見る
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              L1 ベースエリア
            </h2>
            <p className="text-gray-600">
              自治体境界、地区境界、区域情報などの基礎面情報を地図上に表示します。
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              L2 避難所
            </h2>
            <p className="text-gray-600">
              指定避難所の位置に加え、施設名、住所、収容人数、施設種別、開設状況などの属性情報を確認できます。
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              L3 チーム活動
            </h2>
            <p className="text-gray-600">
              支援チームの現在地、活動地点、活動状況などの動的な情報をリアルタイムに把握できます。
            </p>
          </div>
        </div>

        <div className="mt-16 bg-blue-50 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            利用シナリオ
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                一般住民の方
              </h3>
              <p className="text-gray-600">
                地図上でお住まいの地区を確認し、最寄りの避難所や支援チームの活動状況を把握できます。
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                自治体職員・防災担当者の方
              </h3>
              <p className="text-gray-600">
                管理画面から避難所情報やチーム活動データをCSV/Excelでアップロードし、防災マップを更新できます。
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                研究機関の方
              </h3>
              <p className="text-gray-600">
                地域防災情報の可視化・分析プラットフォームとしてご利用いただけます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
