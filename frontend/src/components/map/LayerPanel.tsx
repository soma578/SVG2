'use client'

import { getLayerProfile } from '@/lib/layerProfiles'
import OpacityControl from './OpacityControl'
import SearchBox from './SearchBox'
import ScenarioToggle from './ScenarioToggle'

interface LayerPanelProps {
  layers: Record<string, boolean>
  onToggle: (layerId: string) => void
  layerIds?: string[]
  outageTimeRange?: string
  onOutageTimeRangeChange?: (timeRange: string) => void
  outageDemoMode?: boolean
  onOutageDemoModeChange?: (demo: boolean) => void
  hazardOpacity?: number
  onHazardOpacityChange?: (opacity: number) => void
  boundaryOpacity?: number
  onBoundaryOpacityChange?: (opacity: number) => void
  districts?: any[]
  shelters?: any[]
  spots?: any[]
  welfareFacilities?: any[]
  onSearchResultSelect?: (result: any) => void
  scenario?: 'max' | 'plan'
  onScenarioChange?: (scenario: 'max' | 'plan') => void
}

export default function LayerPanel({
  layers,
  onToggle,
  layerIds,
  outageTimeRange = 'current',
  onOutageTimeRangeChange,
  outageDemoMode = false,
  onOutageDemoModeChange,
  hazardOpacity = 0.6,
  onHazardOpacityChange,
  boundaryOpacity = 0.7,
  onBoundaryOpacityChange,
  districts,
  shelters,
  spots,
  welfareFacilities,
  onSearchResultSelect,
  scenario = 'max',
  onScenarioChange
}: LayerPanelProps) {
  const layerConfig = [
    {
      id: 'basemap',
      group: 'ベースマップ',
    },
    {
      id: 'coastline',
      group: 'ベースマップ',
    },
    {
      id: 'spots',
      group: '情報レイヤー',
    },
    {
      id: 'momochari',
      group: '情報レイヤー',
    },
    {
      id: 'weather',
      group: '情報レイヤー',
    },
    {
      id: 'rain',
      group: '情報レイヤー',
    },
    {
      id: 'slope',
      group: '情報レイヤー',
    },
    {
      id: 'slopeVector',
      group: '情報レイヤー',
    },
    {
      id: 'landslide',
      group: '国土数値情報',
    },
    {
      id: 'realShelters',
      group: '国土数値情報',
    },
    {
      id: 'welfare',
      group: '国土数値情報',
    },
    {
      id: 'rivers',
      group: '国土数値情報',
    },
    {
      id: 'bikes',
      group: '動的レイヤ',
    },
    {
      id: 'districts',
      group: '境界レイヤ',
    },
    {
      id: 'outages',
      group: '防災情報',
    },
  ]

  const allowedLayerIds = layerIds ? new Set(layerIds) : null
  const filteredConfig = allowedLayerIds
    ? layerConfig.filter((layer) => allowedLayerIds.has(layer.id))
    : layerConfig

  const groupedLayers = filteredConfig.reduce((acc, layer) => {
    if (!acc[layer.group]) {
      acc[layer.group] = []
    }
    acc[layer.group].push(layer)
    return acc
  }, {} as Record<string, typeof filteredConfig>)

  return (
    <div>
      {/* 検索ボックス */}
      {onSearchResultSelect && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            検索
          </h2>
          <SearchBox
            onResultSelect={onSearchResultSelect}
            districts={districts}
            shelters={shelters}
            spots={spots}
            welfareFacilities={welfareFacilities}
          />
        </div>
      )}

      <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
        レイヤー
      </h2>

      <div className="space-y-6">
        {Object.entries(groupedLayers).map(([group, groupLayers]) => (
          <div key={group}>
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              {group}
            </h3>
            <div className="space-y-2">
              {groupLayers.map((layer) => (
                <label
                  key={layer.id}
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  {(() => {
                    const profile = getLayerProfile(layer.id)
                    const minZoomText = profile?.minZoom ? `ズーム${profile.minZoom}+` : '全ズーム'
                    const renderHint = profile?.suggestedRenderMode === 'canvas' ? 'Canvas推奨' : undefined
                    return (
                      <>
                        <input
                          type="checkbox"
                          checked={layers[layer.id] || false}
                          onChange={() => onToggle(layer.id)}
                          className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-700">{profile?.title ?? layer.id}</span>
                          <span className="text-[11px] text-gray-500">
                            {minZoomText}{renderHint ? ` / ${renderHint}` : ''}
                          </span>
                        </div>
                      </>
                    )
                  })()}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 停電レイヤーの時間範囲選択 */}
      {layers.outages && onOutageTimeRangeChange && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-red-900 mb-3">
            停電情報の時間範囲
          </h3>
          <div className="space-y-2">
            {[
              { value: 'current', label: 'リアルタイム（現在）' },
              { value: '1h', label: '過去1時間' },
              { value: '24h', label: '過去24時間' },
              { value: '7d', label: '過去3日間' },
            ].map((option) => (
              <label
                key={option.value}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name="outageTimeRange"
                  value={option.value}
                  checked={outageTimeRange === option.value}
                  onChange={(e) => onOutageTimeRangeChange(e.target.value)}
                  className="w-4 h-4 text-red-600 focus:ring-red-500 border-gray-300"
                />
                <span className="text-sm text-red-900">{option.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 text-xs text-red-700">
            {outageTimeRange === 'current' && '現在の停電情報を5分ごとに更新'}
            {outageTimeRange === '1h' && '過去1時間以内の停電履歴を表示'}
            {outageTimeRange === '24h' && '過去24時間以内の停電履歴を表示'}
            {outageTimeRange === '7d' && '過去3日間の停電履歴を表示'}
          </div>
          {onOutageDemoModeChange && (
            <div className="mt-4 pt-3 border-t border-red-200">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={outageDemoMode}
                  onChange={(e) => onOutageDemoModeChange(e.target.checked)}
                  className="w-4 h-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                />
                <span className="text-sm text-red-900">デモモード（テストデータ表示）</span>
              </label>
              <div className="mt-2 text-xs text-red-600">
                {outageDemoMode
                  ? '⚠️ テスト用のダミーデータを表示中'
                  : '✅ 中国電力の実データを取得中'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 規模切替 */}
      {(layers.landslide || layers.slope) && onScenarioChange && (
        <div className="mt-6">
          <ScenarioToggle
            scenario={scenario}
            onChange={onScenarioChange}
          />
        </div>
      )}

      {/* 透明度コントロール */}
      {(layers.landslide || layers.slope) && onHazardOpacityChange && (
        <div className="mt-6">
          <OpacityControl
            layerGroup="hazard"
            opacity={hazardOpacity}
            onChange={onHazardOpacityChange}
          />
        </div>
      )}

      {layers.districts && onBoundaryOpacityChange && (
        <div className="mt-4">
          <OpacityControl
            layerGroup="boundary"
            opacity={boundaryOpacity}
            onChange={onBoundaryOpacityChange}
          />
        </div>
      )}

      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <div className="text-xs text-gray-600 space-y-2">
          <div className="flex justify-between">
            <span>表示中レイヤー:</span>
            <span className="font-semibold">
              {Object.values(layers).filter(Boolean).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
