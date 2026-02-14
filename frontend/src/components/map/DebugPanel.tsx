'use client'

import { useState, useEffect } from 'react'

interface DebugStats {
  // レイヤー別のfeature数
  layerCounts: Record<string, number>
  // 処理時間
  lastClickProcessingTime?: number
  lastPipTime?: number
  lastShelterSearchTime?: number
  // 候補数
  pipCandidates?: number
  pipChecked?: number
  // 総計
  totalFeatures: number
  // FPS
  fps?: number
}

interface DebugPanelProps {
  stats: DebugStats
  visible?: boolean
}

export default function DebugPanel({ stats, visible = true }: DebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!visible) return null

  return (
    <div className="absolute top-4 right-4 z-40 bg-black/80 text-white text-xs font-mono rounded-lg shadow-2xl overflow-hidden max-w-xs">
      {/* ヘッダー */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-black/90 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-green-400">⚡</span>
          <span className="font-semibold">Debug</span>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* コンテンツ */}
      {isExpanded && (
        <div className="px-3 py-2 space-y-3 border-t border-white/20">
          {/* 総計 */}
          <div>
            <div className="text-yellow-400 font-semibold mb-1">総描画Features</div>
            <div className="text-lg">{stats.totalFeatures.toLocaleString()}</div>
          </div>

          {/* レイヤー別 */}
          {Object.keys(stats.layerCounts).length > 0 && (
            <div>
              <div className="text-yellow-400 font-semibold mb-1">レイヤー別</div>
              <div className="space-y-0.5 text-[10px]">
                {Object.entries(stats.layerCounts)
                  .filter(([_, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([layer, count]) => (
                    <div key={layer} className="flex justify-between gap-2">
                      <span className="text-gray-400 truncate">{layer}</span>
                      <span className="text-green-400">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 処理時間 */}
          {(stats.lastClickProcessingTime || stats.lastPipTime || stats.lastShelterSearchTime) && (
            <div>
              <div className="text-yellow-400 font-semibold mb-1">処理時間</div>
              <div className="space-y-0.5 text-[10px]">
                {stats.lastClickProcessingTime !== undefined && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">クリック処理</span>
                    <span className={stats.lastClickProcessingTime > 500 ? 'text-red-400' : 'text-green-400'}>
                      {stats.lastClickProcessingTime.toFixed(1)}ms
                    </span>
                  </div>
                )}
                {stats.lastPipTime !== undefined && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">PIP判定</span>
                    <span className={stats.lastPipTime > 100 ? 'text-red-400' : 'text-green-400'}>
                      {stats.lastPipTime.toFixed(1)}ms
                    </span>
                  </div>
                )}
                {stats.lastShelterSearchTime !== undefined && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">避難所検索</span>
                    <span className={stats.lastShelterSearchTime > 100 ? 'text-red-400' : 'text-green-400'}>
                      {stats.lastShelterSearchTime.toFixed(1)}ms
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PIP候補数 */}
          {(stats.pipCandidates !== undefined || stats.pipChecked !== undefined) && (
            <div>
              <div className="text-yellow-400 font-semibold mb-1">PIP最適化</div>
              <div className="space-y-0.5 text-[10px]">
                {stats.pipCandidates !== undefined && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">候補数（絞込後）</span>
                    <span className="text-blue-400">{stats.pipCandidates}</span>
                  </div>
                )}
                {stats.pipChecked !== undefined && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400">実際にチェック</span>
                    <span className="text-blue-400">{stats.pipChecked}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FPS */}
          {stats.fps !== undefined && (
            <div>
              <div className="text-yellow-400 font-semibold mb-1">FPS</div>
              <div className="text-lg">
                <span className={stats.fps < 30 ? 'text-red-400' : stats.fps < 50 ? 'text-yellow-400' : 'text-green-400'}>
                  {stats.fps.toFixed(0)}
                </span>
              </div>
            </div>
          )}

          {/* 注意事項 */}
          <div className="pt-2 border-t border-white/20 text-[10px] text-gray-400">
            ⚠️ 開発用デバッグ情報
          </div>
        </div>
      )}
    </div>
  )
}
