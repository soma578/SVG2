'use client'

interface LegendProps {
  activeLayers: Record<string, boolean>
}

export default function Legend({ activeLayers }: LegendProps) {
  const hasVisibleLegend =
    activeLayers.landslide ||
    activeLayers.flood ||
    activeLayers.tsunami ||
    activeLayers.slope

  if (!hasVisibleLegend) {
    return null
  }

  return (
    <div className="absolute bottom-20 left-4 bg-white/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-4 max-w-xs z-20">
      <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        凡例
      </h3>

      <div className="space-y-3">
        {/* 土砂災害警戒区域 */}
        {activeLayers.landslide && (
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1.5">
              土砂災害警戒区域
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-4 bg-orange-400 border border-orange-600 rounded"></div>
                <span className="text-xs text-gray-600">警戒区域</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-4 bg-red-600 border border-red-900 rounded"></div>
                <span className="text-xs text-gray-600">特別警戒区域</span>
              </div>
            </div>
          </div>
        )}

        {/* 浸水想定区域（将来実装用） */}
        {activeLayers.flood && (
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1.5">
              浸水想定区域
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-4 bg-blue-100 border border-blue-300 rounded"></div>
                <span className="text-xs text-gray-600">0.5m未満</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-4 bg-blue-300 border border-blue-500 rounded"></div>
                <span className="text-xs text-gray-600">0.5〜3m</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-4 bg-blue-500 border border-blue-700 rounded"></div>
                <span className="text-xs text-gray-600">3〜5m</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-4 bg-blue-800 border border-blue-950 rounded"></div>
                <span className="text-xs text-gray-600">5m以上</span>
              </div>
            </div>
          </div>
        )}

        {/* 津波浸水想定（将来実装用） */}
        {activeLayers.tsunami && (
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1.5">
              津波浸水想定
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-4 bg-purple-200 border border-purple-400 rounded"></div>
                <span className="text-xs text-gray-600">浸水区域</span>
              </div>
            </div>
          </div>
        )}

        {/* 傾斜（坂） */}
        {activeLayers.slope && (
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1.5">
              地形（傾斜）
            </div>
            <div className="text-xs text-gray-600">
              色の濃淡で傾斜を表示
            </div>
            <div className="mt-1.5 h-3 rounded bg-gradient-to-r from-green-100 via-yellow-200 to-red-400 border border-gray-300"></div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-0.5">
              <span>平坦</span>
              <span>急傾斜</span>
            </div>
          </div>
        )}
      </div>

      {/* 注意事項 */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          ※ 表示は想定であり、実際の災害状況とは異なる場合があります
        </p>
      </div>
    </div>
  )
}
