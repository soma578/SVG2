'use client'

import type { ReactNode } from 'react'

import {
  currentMapDefaultLayerOpacity,
  currentMapOpacityLayerIds,
} from '@/features/map/engine/layerOpacity'
import { getLayerProfile } from '@/lib/layerProfiles'
import {
  currentMapLayerDefinitions,
  type CurrentMapLayerId,
} from '@/features/map/engine/layerDefinitions'
import { currentMapRegionConfig, type CurrentMapRegionConfig } from '@/lib/currentMapRegion'
import OpacityControl from './OpacityControl'
import SearchBox from './SearchBox'
import type { SearchResult } from './SearchBox'

interface LayerPanelProps {
  layers: Record<string, boolean>
  onToggle: (layerId: string) => void
  layerIds?: string[]
  layerOpacity?: Partial<Record<CurrentMapLayerId, number>>
  onLayerOpacityChange?: (next: Partial<Record<CurrentMapLayerId, number>>) => void
  onSearchResultSelect?: (result: SearchResult) => void
  regionConfig?: CurrentMapRegionConfig
  contextPanel?: ReactNode
}

export default function LayerPanel({
  layers,
  onToggle,
  layerIds,
  layerOpacity = currentMapDefaultLayerOpacity,
  onLayerOpacityChange,
  onSearchResultSelect,
  regionConfig = currentMapRegionConfig,
  contextPanel,
}: LayerPanelProps) {
  const opacityControlLayers = filteredOpacityControlLayers(layerIds)

  const layerConfig = [
    {
      id: 'baseArea',
      group: '主要業務レイヤー',
    },
    {
      id: 'evacuation',
      group: '主要業務レイヤー',
    },
    {
      id: 'teamActivity',
      group: '主要業務レイヤー',
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
      {contextPanel && (
        <div className="mb-6">
          {contextPanel}
        </div>
      )}

      {/* 検索ボックス */}
      {onSearchResultSelect && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
            検索
          </h2>
          <SearchBox
            onResultSelect={onSearchResultSelect}
            regionConfig={regionConfig}
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
                    const profile = getLayerProfile(layer.id) ?? getLayerProfile(layer.id)
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

      {/* 透明度コントロール */}
      {opacityControlLayers.some((layerId) => layers[layerId]) && onLayerOpacityChange && (
        <div className="mt-6 space-y-3">
          {opacityControlLayers
            .filter((layerId) => layers[layerId])
            .map((layerId) => (
              <OpacityControl
                key={layerId}
                label={getLayerProfile(layerId)?.title ?? currentMapLayerDefinitions[layerId]?.label ?? layerId}
                opacity={layerOpacity[layerId] ?? currentMapDefaultLayerOpacity[layerId] ?? 0.6}
                onChange={(opacity) => {
                  onLayerOpacityChange({
                    ...layerOpacity,
                    [layerId]: opacity,
                  })
                }}
              />
            ))}
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

function filteredOpacityControlLayers(layerIds?: string[]): CurrentMapLayerId[] {
  if (!layerIds) return [...currentMapOpacityLayerIds]
  const allowed = new Set(layerIds)
  return currentMapOpacityLayerIds.filter((layerId) => allowed.has(layerId))
}
