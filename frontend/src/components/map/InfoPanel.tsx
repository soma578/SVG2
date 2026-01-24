'use client'

import type { Shelter } from '@/types'

interface InfoPanelProps {
  shelterData: Shelter | null
  onClose: () => void
}

export default function InfoPanel({ shelterData, onClose }: InfoPanelProps) {
  if (!shelterData) {
    return null
  }

  return (
    <aside className="absolute right-4 top-4 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-30 overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
        <div className="flex justify-between items-start">
          <h2 className="text-lg font-bold text-white pr-2">
            {shelterData.name}
          </h2>
          <button
            onClick={onClose}
            className="text-white/90 hover:text-white transition-colors flex-shrink-0"
            aria-label="閉じる"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 詳細情報 */}
      <div className="p-5 space-y-4">
        {/* 種別バッジ */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {shelterData.kind === 'castle' ? '🏯 城郭' :
             shelterData.kind === 'garden' ? '🌳 庭園' :
             shelterData.kind === 'tourist' ? '🗺️ 観光地' :
             shelterData.kind === 'shrine' ? '⛩️ 神社' :
             shelterData.kind === 'bridge' ? '🌉 橋梁' :
             shelterData.kind === 'momochari' ? '🚲 ももちゃり' : '📍 スポット'}
          </span>
        </div>

        {/* 住所・説明 */}
        {shelterData.summary && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              詳細情報
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">
              {shelterData.summary}
            </p>
          </div>
        )}

        {/* 座標情報 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">緯度</div>
            <div className="text-sm font-semibold text-gray-900">
              {shelterData.lat.toFixed(5)}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-1">経度</div>
            <div className="text-sm font-semibold text-gray-900">
              {shelterData.lon.toFixed(5)}
            </div>
          </div>
        </div>

        {/* Google Maps で開く */}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${shelterData.lat},${shelterData.lon}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-green-600 hover:bg-green-700 text-white text-center font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <span>Googleマップで開く</span>
          </div>
        </a>

        {/* Wikipedia リンク */}
        {shelterData.url && shelterData.url !== '#' && (
          <a
            href={shelterData.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-gray-700 hover:bg-gray-800 text-white text-center font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.231-.177-.242-.481-.525-.878-.807l-.619-.43V3h6.818v.974l-1.008.07c-.493.032-.782.212-.782.461 0 .126.109.4.246.738.688 1.737 2.065 4.956 2.891 6.859l2.301-4.948c.369-.772.525-1.25.525-1.566 0-.314-.217-.573-.648-.778l-.813-.43V3h4.88v.974l-.738.072c-.328.033-.633.184-.904.45-.271.265-.507.629-.709 1.089l-3.871 8.534zm4.181-6.827l-1.195 2.578 3.825 8.313c.211.456.439.862.684 1.213.244.35.549.65.915.899l.586.399V21h-6.818v-.974l.814-.072c.404-.032.686-.212.686-.461 0-.126-.109-.4-.246-.738l-1.275-2.774-2.104-4.538-1.057 2.274c-.369.772-.525 1.25-.525 1.566 0 .314.217.573.648.778l.813.43V21H6.818v-.974l.738-.072c.328-.033.633-.184.904-.45.271-.265.507-.629.709-1.089l3.871-8.534.916-1.976z"/>
              </svg>
              <span>Wikipediaで詳細を見る</span>
            </div>
          </a>
        )}
      </div>

      {/* フッター */}
      <div className="bg-gray-50 px-5 py-3 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          ピンをクリックして避難所情報を確認
        </p>
      </div>
    </aside>
  )
}
