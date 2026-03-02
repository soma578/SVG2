'use client'

import { useMemo, useState } from 'react'
import { MAIN_FACILITY_TYPES } from '@/lib/welfareFacilityTypes'

interface LegendProps {
  activeLayers: Record<string, boolean>
  zoom: number
  welfareDisplayMode?: 'cluster' | '3d' | 'heatmap'
  onWelfareDisplayModeChange?: (mode: 'cluster' | '3d' | 'heatmap') => void
}

export default function Legend({ activeLayers, zoom, welfareDisplayMode = 'heatmap', onWelfareDisplayModeChange }: LegendProps) {
  const [expanded, setExpanded] = useState(false)
  const welfareMode = useMemo(() => {
    if (zoom < 8.7) return 'pref'
    if (zoom < 11) return 'heatmap'
    if (zoom < 14) return 'districtCluster'
    return 'point'
  }, [zoom])

  const hasVisibleLegend =
    activeLayers.landslide ||
    activeLayers.flood ||
    activeLayers.tsunami ||
    activeLayers.slope ||
    activeLayers.welfare

  if (!hasVisibleLegend) {
    return null
  }

  return (
    <div className="absolute left-4 top-4 bg-white/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-3 max-w-xs z-20">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left text-sm font-bold text-gray-900 flex items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        凡例
        </span>
        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!expanded && (
        <p className="text-[11px] text-gray-600 mt-2">
          表示中: {activeLayers.welfare ? (welfareMode === 'pref' ? '福祉（県集計）' : welfareMode === 'heatmap' ? '福祉（市町村集計）' : welfareMode === 'districtCluster' ? '福祉（地区クラスタ）' : '福祉（個別点）') : '防災レイヤー'}
        </p>
      )}

      {expanded && <div className="space-y-3 mt-3">
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

        {/* 福祉施設 */}
        {activeLayers.welfare && (
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1.5">
              老人福祉施設（全国38,891施設）
            </div>
            <div className="text-[10px] text-gray-600 mb-2">指標: 施設件数（件） / 色・サイズとも件数に比例（連続）</div>

            {/* 表示モード切替ボタン */}
            {onWelfareDisplayModeChange && (
              <div className="grid grid-cols-3 gap-1 mb-2">
                <button
                  onClick={() => onWelfareDisplayModeChange('heatmap')}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                    welfareDisplayMode === 'heatmap'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ヒートマップ
                </button>
                <button
                  onClick={() => onWelfareDisplayModeChange('3d')}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                    welfareDisplayMode === '3d'
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  3D
                </button>
                <button
                  onClick={() => onWelfareDisplayModeChange('cluster')}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                    welfareDisplayMode === 'cluster'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  クラスター
                </button>
              </div>
            )}

            {/* クラスターモード時の凡例 */}
            {welfareDisplayMode === 'cluster' && (
              <>
                {/* 県広域 */}
            {welfareMode === 'pref' && <div className="mb-2 text-[10px] text-gray-500 bg-gray-50 rounded p-2">
              <div className="font-semibold mb-1">県広域（ズーム0-8.7）</div>
              <div>県全体を1クラスタで表示</div>
              <div className="mt-1.5 h-3 rounded bg-gradient-to-r from-[#dbeafe] via-[#7dd3fc] via-[#22c55e] via-[#eab308] via-[#f97316] to-[#ef4444] border border-gray-300"></div>
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>500</span>
                <span>1,000</span>
                <span>1,500</span>
                <span>2,000</span>
                <span>3,000件</span>
              </div>
            </div>}

            {/* 市町村クラスター */}
            {welfareMode === 'heatmap' && <div className="text-[10px] text-gray-500 bg-gray-50 rounded p-2">
              <div className="font-semibold mb-1">市町村クラスター（ズーム8.7-11）</div>
              <div className="mb-1">自治体中心に件数クラスタ表示</div>
              <div className="mt-1.5 h-3 rounded bg-gradient-to-r from-[#dbeafe] via-[#7dd3fc] via-[#22c55e] via-[#eab308] via-[#f97316] to-[#ef4444] border border-gray-300"></div>
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>1</span>
                <span>20</span>
                <span>100</span>
                <span>200</span>
                <span>500件</span>
              </div>
            </div>}

            {/* 地区クラスター */}
            {welfareMode === 'districtCluster' && <div className="text-[10px] text-gray-500 bg-gray-50 rounded p-2">
              <div className="font-semibold mb-1">地区クラスター（ズーム11-14）</div>
              <div className="mb-1">地区単位の件数クラスタ表示</div>
              <div className="mt-1.5 h-3 rounded bg-gradient-to-r from-[#dbeafe] via-[#7dd3fc] via-[#22c55e] via-[#eab308] via-[#f97316] to-[#ef4444] border border-gray-300"></div>
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>1</span>
                <span>5</span>
                <span>10</span>
                <span>30</span>
                <span>50件</span>
              </div>
            </div>}

            {/* 個別ポイント */}
            {welfareMode === 'point' && <div className="text-[10px] text-gray-500 bg-gray-50 rounded p-2">
              <div className="font-semibold mb-1">個別点（ズーム14以上）</div>
              <div className="mb-1">色は施設種別（P14_006）で分類</div>
              <div className="space-y-1">
                {MAIN_FACILITY_TYPES.map((type) => (
                  <div key={type.code} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border border-white shadow-sm" style={{ backgroundColor: type.color }} />
                    <span className="text-[10px] text-gray-700">{type.name}</span>
                  </div>
                ))}
              </div>
            </div>}
              </>
            )}

            {/* 市町村モード時の凡例 */}
            {welfareDisplayMode === 'heatmap' && (
              <div className="text-[10px] text-gray-500 bg-gray-50 rounded p-2">
                <div className="font-semibold mb-1">市町村コロプレス（ズーム8.7-11）</div>
                <div className="mb-1">市町村ごとの施設数で色分け</div>
                <div className="mt-1.5 h-3 rounded bg-gradient-to-r from-[#dbeafe] via-[#7dd3fc] via-[#22c55e] via-[#eab308] via-[#f97316] to-[#ef4444] border border-gray-300"></div>
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>0</span>
                  <span>10</span>
                  <span>30</span>
                  <span>100</span>
                  <span>300件</span>
                </div>
                <div className="mt-2 text-[9px] text-gray-600">
                  • 日本全体を市町村単位で色塗り<br/>
                  • 赤: 施設が多い<br/>
                  • 青: 施設が少ない<br/>
                  • <strong>クラスターと同じ配色</strong>
                </div>
              </div>
            )}

            {/* 3Dモード時の凡例 */}
            {welfareDisplayMode === '3d' && (
              <div className="text-[10px] text-gray-500 bg-gray-50 rounded p-2">
                <div className="font-semibold mb-1">3D表示（ズーム連動3段階）</div>

                {zoom < 9 && (
                  <>
                    <div className="mb-1 font-medium text-purple-600">都道府県レベル（z&lt;9）</div>
                    <div className="mt-1.5 h-3 rounded bg-gradient-to-r from-[#dbeafe] via-[#22c55e] via-[#eab308] to-[#ef4444] border border-gray-300"></div>
                    <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                      <span>100</span>
                      <span>1,000</span>
                      <span>2,000</span>
                      <span>5,000件</span>
                    </div>
                  </>
                )}

                {zoom >= 9 && zoom < 11 && (
                  <>
                    <div className="mb-1 font-medium text-purple-600">市区町村レベル（z9-11）</div>
                    <div className="mt-1.5 h-3 rounded bg-gradient-to-r from-[#dbeafe] via-[#22c55e] via-[#eab308] to-[#ef4444] border border-gray-300"></div>
                    <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                      <span>10</span>
                      <span>50</span>
                      <span>100</span>
                      <span>500件</span>
                    </div>
                  </>
                )}

                {zoom >= 11 && (
                  <>
                    <div className="mb-1 font-medium text-purple-600">メッシュレベル（z≥11）</div>
                    <div className="mt-1.5 h-3 rounded bg-gradient-to-r from-[#3b82f6] via-[#10b981] via-[#eab308] via-[#f97316] to-[#ef4444] border border-gray-300"></div>
                    <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                      <span>1</span>
                      <span>10</span>
                      <span>20</span>
                      <span>50件</span>
                    </div>
                  </>
                )}

                <div className="mt-2 text-[9px] text-gray-600">
                  • ズームアウト: 都道府県 → 市区町村 → メッシュ<br/>
                  • 高さ: 施設数に比例（誇張表現）<br/>
                  • 視点が自動で60度傾きます
                </div>
              </div>
            )}

            <div className="text-[10px] text-gray-500 mt-2 italic">
              {welfareDisplayMode === 'heatmap' && '※ 市町村境界は施設分布から自動生成'}
              {welfareDisplayMode === 'cluster' && '※ 薄色表示（主張しすぎない配色）'}
              {welfareDisplayMode === '3d' && '※ 右クリック+ドラッグで視点回転可能'}
            </div>
          </div>
        )}
      </div>
      }

      {/* 注意事項 */}
      {expanded && <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          ※ 表示は想定であり、実際の災害状況とは異なる場合があります
        </p>
      </div>}
    </div>
  )
}
