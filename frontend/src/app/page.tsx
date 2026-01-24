import Layout from '@/components/Layout'
import Link from 'next/link'

export default function Home() {
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            岡山防災マップシステム
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            岡山県内の避難所・ハザード情報を一元的に閲覧できるWebマップ
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
              避難所情報
            </h2>
            <p className="text-gray-600">
              岡山市および岡山県が指定する避難所の位置・詳細情報を確認できます。
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              ハザード情報
            </h2>
            <p className="text-gray-600">
              洪水浸水想定区域や土砂災害警戒区域などのハザード情報を重ねて表示できます。
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              SVGMapベース
            </h2>
            <p className="text-gray-600">
              SVGMapのハイパーレイヤリング技術で、複数の地図レイヤを統合表示します。
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
                自宅周辺の危険度や最寄り避難所を確認し、防災計画を立てることができます。
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                自治体職員の方
              </h3>
              <p className="text-gray-600">
                避難所情報の更新や、防災啓発資料の作成にご活用いただけます。
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                研究機関の方
              </h3>
              <p className="text-gray-600">
                岡山地域の防災情報を可視化・分析するプラットフォームとしてご利用いただけます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
