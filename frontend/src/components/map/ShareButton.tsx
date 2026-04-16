'use client'

import { useState, useEffect } from 'react'
import type { MapState } from '@/lib/urlState'
import { generateShareURLWithRegion } from '@/lib/urlState'

interface ShareButtonProps {
  state: MapState
  regionId?: string
}

export default function ShareButton({ state, regionId }: ShareButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareURL, setShareURL] = useState('')

  // クライアント側でURLを生成
  useEffect(() => {
    setShareURL(generateShareURLWithRegion(state, regionId))
  }, [regionId, state])

  const handleShare = () => {
    setShowModal(true)
    setCopied(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareURL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('[Share] Failed to copy:', error)
    }
  }

  const handleTwitterShare = () => {
    const text = '岡山防災マップ'
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareURL)}`
    window.open(url, '_blank', 'width=550,height=420')
  }

  const handleLineShare = () => {
    const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(shareURL)}`
    window.open(url, '_blank', 'width=550,height=420')
  }

  return (
    <>
      {/* 共有ボタン */}
      <button
        onClick={handleShare}
        className="bg-white/90 hover:bg-white text-gray-800 border border-gray-200 shadow-md p-2.5 rounded-full backdrop-blur transition"
        title="この地図を共有"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      </button>

      {/* 共有モーダル */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                この地図を共有
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* コンテンツ */}
            <div className="p-5 space-y-4">
              {/* URL表示 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  共有URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareURL}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-700"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={handleCopy}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      copied
                        ? 'bg-green-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {copied ? (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        コピー完了
                      </span>
                    ) : (
                      'コピー'
                    )}
                  </button>
                </div>
              </div>

              {/* SNS共有ボタン */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  SNSで共有
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={handleTwitterShare}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white rounded-lg font-medium transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                    </svg>
                    Twitter
                  </button>
                  <button
                    onClick={handleLineShare}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#00B900] hover:bg-[#00a000] text-white rounded-lg font-medium transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.771.039 1.076l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                    </svg>
                    LINE
                  </button>
                </div>
              </div>

              {/* 保存される情報 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-blue-900 mb-2">
                  📌 保存される情報
                </div>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• 地図の中心位置とズームレベル</li>
                  <li>• 表示中のレイヤー（ON/OFF状態）</li>
                  <li>• レイヤーの透明度設定</li>
                  <li>• 選択中の地図エンジンと注目地点</li>
                </ul>
              </div>
            </div>

            {/* フッター */}
            <div className="p-5 bg-gray-50 border-t border-gray-200 rounded-b-xl">
              <button
                onClick={() => setShowModal(false)}
                className="w-full px-4 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg font-medium transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
