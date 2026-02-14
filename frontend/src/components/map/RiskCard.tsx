'use client'

interface NearestShelter {
  name: string
  address: string
  type: string
  distance: number
  walkingTime: number
  lat: number
  lon: number
}

interface RiskInfo {
  lat: number
  lon: number
  districtName?: string
  cityName?: string
  flood?: {
    exists: boolean
    depth?: string
    depthClass?: string
    scenario?: string
  }
  landslide?: {
    exists: boolean
    hazardKind?: string
    level?: string
  }
  tsunami?: {
    exists: boolean
    depthClass?: string
  }
  nearestShelters: NearestShelter[]
  elevation?: number
}

interface RiskCardProps {
  riskInfo: RiskInfo | null
  onClose: () => void
}

export default function RiskCard({ riskInfo, onClose }: RiskCardProps) {
  if (!riskInfo) {
    return null
  }

  return (
    <aside className="absolute right-4 top-4 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-30 overflow-hidden max-h-[calc(100vh-2rem)]">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-red-600 to-red-700 px-5 py-4 sticky top-0 z-10">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-white">
              地点リスク評価
            </h2>
            <p className="text-sm text-red-100 mt-1">
              {riskInfo.districtName ? (
                <>{riskInfo.cityName} {riskInfo.districtName}</>
              ) : (
                <>{riskInfo.cityName || '区画情報なし'}</>
              )}
            </p>
          </div>
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
      <div className="overflow-y-auto max-h-[calc(100vh-10rem)]">
        <div className="p-5 space-y-5">
          {/* 座標情報 */}
          <div className="bg-gray-50 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              位置情報
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500">緯度</div>
                <div className="text-sm font-semibold text-gray-900">
                  {riskInfo.lat.toFixed(5)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">経度</div>
                <div className="text-sm font-semibold text-gray-900">
                  {riskInfo.lon.toFixed(5)}
                </div>
              </div>
            </div>
            {riskInfo.elevation !== undefined && (
              <div className="mt-2">
                <div className="text-xs text-gray-500">標高</div>
                <div className="text-sm font-semibold text-gray-900">
                  {riskInfo.elevation.toFixed(1)} m
                </div>
              </div>
            )}
          </div>

          {/* 災害リスク */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              災害リスク
            </h3>
            <div className="space-y-2">
              {/* 浸水リスク */}
              <div className={`rounded-lg p-3 border-2 ${
                riskInfo.flood?.exists
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-green-50 border-green-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌊</span>
                    <span className="text-sm font-semibold text-gray-900">浸水リスク</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    riskInfo.flood?.exists
                      ? 'bg-blue-200 text-blue-900'
                      : 'bg-green-200 text-green-900'
                  }`}>
                    {riskInfo.flood?.exists ? 'あり' : 'なし'}
                  </span>
                </div>
                {riskInfo.flood?.exists && riskInfo.flood.depth && (
                  <div className="mt-2 text-xs text-gray-700">
                    <div>深さ: {riskInfo.flood.depth}</div>
                    {riskInfo.flood.scenario && (
                      <div className="text-gray-500">規模: {riskInfo.flood.scenario === 'max' ? '想定最大規模' : '計画規模'}</div>
                    )}
                  </div>
                )}
              </div>

              {/* 土砂災害リスク */}
              <div className={`rounded-lg p-3 border-2 ${
                riskInfo.landslide?.exists
                  ? 'bg-orange-50 border-orange-300'
                  : 'bg-green-50 border-green-300'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⛰️</span>
                    <span className="text-sm font-semibold text-gray-900">土砂災害リスク</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${
                    riskInfo.landslide?.exists
                      ? 'bg-orange-200 text-orange-900'
                      : 'bg-green-200 text-green-900'
                  }`}>
                    {riskInfo.landslide?.exists ? 'あり' : 'なし'}
                  </span>
                </div>
                {riskInfo.landslide?.exists && (
                  <div className="mt-2 text-xs text-gray-700">
                    {riskInfo.landslide.hazardKind && (
                      <div>種別: {riskInfo.landslide.hazardKind}</div>
                    )}
                    {riskInfo.landslide.level && (
                      <div className="text-orange-700 font-semibold">
                        {riskInfo.landslide.level === 'special_warning' ? '特別警戒区域' : '警戒区域'}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 津波リスク */}
              {riskInfo.tsunami !== undefined && (
                <div className={`rounded-lg p-3 border-2 ${
                  riskInfo.tsunami?.exists
                    ? 'bg-purple-50 border-purple-300'
                    : 'bg-green-50 border-green-300'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌊</span>
                      <span className="text-sm font-semibold text-gray-900">津波リスク</span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      riskInfo.tsunami?.exists
                        ? 'bg-purple-200 text-purple-900'
                        : 'bg-green-200 text-green-900'
                    }`}>
                      {riskInfo.tsunami?.exists ? 'あり' : 'なし'}
                    </span>
                  </div>
                  {riskInfo.tsunami?.exists && riskInfo.tsunami.depthClass && (
                    <div className="mt-2 text-xs text-gray-700">
                      深さ区分: {riskInfo.tsunami.depthClass}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 最寄りの避難所 */}
          {riskInfo.nearestShelters.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                最寄りの避難所（上位3件）
              </h3>
              <div className="space-y-2">
                {riskInfo.nearestShelters.map((shelter, index) => (
                  <div
                    key={index}
                    className="bg-blue-50 border border-blue-200 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-gray-900 truncate">
                          {index + 1}. {shelter.name}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {shelter.type}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          {shelter.address}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="bg-white rounded px-2 py-1">
                        <div className="text-xs text-gray-500">距離</div>
                        <div className="text-sm font-semibold text-gray-900">
                          {shelter.distance >= 1000
                            ? `${(shelter.distance / 1000).toFixed(1)} km`
                            : `${Math.round(shelter.distance)} m`}
                        </div>
                      </div>
                      <div className="bg-white rounded px-2 py-1">
                        <div className="text-xs text-gray-500">徒歩時間（概算）</div>
                        <div className="text-sm font-semibold text-gray-900">
                          約 {shelter.walkingTime} 分
                        </div>
                      </div>
                    </div>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&origin=${riskInfo.lat},${riskInfo.lon}&destination=${shelter.lat},${shelter.lon}&travelmode=walking`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-center text-xs font-medium py-1.5 px-3 rounded transition-colors"
                    >
                      ルートを確認
                    </a>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500 bg-yellow-50 border border-yellow-200 rounded p-2">
                ⚠️ 徒歩時間は直線距離から概算（80m/分）したものです。実際の道路距離とは異なります。
              </div>
            </div>
          )}

          {/* 注意事項 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <h3 className="text-xs font-semibold text-yellow-900 mb-2">
              ⚠️ 注意事項
            </h3>
            <ul className="text-xs text-yellow-800 space-y-1">
              <li>• 想定は最大規模であり、実際の災害とは異なる可能性があります</li>
              <li>• データ更新日を確認し、最新情報は自治体等でご確認ください</li>
              <li>• 避難の際は周囲の状況を確認し、安全を最優先してください</li>
            </ul>
          </div>
        </div>
      </div>

      {/* フッター */}
      <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 sticky bottom-0">
        <p className="text-xs text-gray-500 text-center">
          データ出典: 国土数値情報、国土交通省、岡山市等
        </p>
      </div>
    </aside>
  )
}
