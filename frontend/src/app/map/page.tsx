'use client'

import { useState, useMemo } from 'react'
import LayerPanel from '@/components/map/LayerPanel'
import MapLibreMap from '@/components/map/MapLibreMap'

const layerIds = [
  'basemap',
  'spots',
  'momochari',
  'slope',
  'landslide',
  'rivers',
  'districts',
  'outages',
]

const defaultLayers: Record<string, boolean> = {
  basemap: true,
  spots: true,
  momochari: false,
  slope: false,
  landslide: false,
  rivers: false,
  districts: false,
  outages: false,
}

export default function MapPage() {
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(defaultLayers)
  const [showSettings, setShowSettings] = useState(true)
  const [outageTimeRange, setOutageTimeRange] = useState('current')
  const [outageDemoMode, setOutageDemoMode] = useState(false)

  const handleLayerToggle = (layerId: string) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }))
  }

  const handleOutageTimeRangeChange = (timeRange: string) => {
    setOutageTimeRange(timeRange)
  }

  const handleOutageDemoModeChange = (demo: boolean) => {
    setOutageDemoMode(demo)
  }

  return (
    <div className="h-screen flex relative">
      {showSettings && (
        <aside className="w-80 bg-white border-r border-gray-200 shadow-lg overflow-y-auto flex-shrink-0 z-30">
          <div className="p-6">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                  岡山防災マップ
                </h1>
                <p className="text-sm text-gray-600">
                  MapLibre GL JS版
                </p>
              </div>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setShowSettings(false)}
                className="text-gray-500 hover:text-gray-800 border border-gray-200 rounded-full p-2 bg-gray-50"
                title="Close settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <LayerPanel
              layers={activeLayers}
              onToggle={handleLayerToggle}
              layerIds={layerIds}
              outageTimeRange={outageTimeRange}
              onOutageTimeRangeChange={handleOutageTimeRangeChange}
              outageDemoMode={outageDemoMode}
              onOutageDemoModeChange={handleOutageDemoModeChange}
            />

            <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                使い方
              </h3>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• レイヤーをON/OFFして情報を切り替え</li>
                <li>• マップをドラッグで移動、ホイールでズーム</li>
                <li>• 右側のボタンでズーム・現在地</li>
              </ul>
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 relative z-0">
        <MapLibreMap
          activeLayers={activeLayers}
          showSidebar={showSettings}
          outageTimeRange={outageTimeRange}
          outageDemoMode={outageDemoMode}
        />

        {!showSettings && (
          <div className="absolute left-4 top-4 z-40">
            <button
              type="button"
              aria-label="設定を開く"
              title="設定を開く"
              onClick={() => setShowSettings(true)}
              className="bg-white/90 hover:bg-white text-gray-800 border border-gray-200 shadow-md p-2 rounded-full backdrop-blur transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
