'use client'

import { useState } from 'react'

interface LegendProps {
  activeLayers: Record<string, boolean>
  zoom: number
  sidebarOpen?: boolean
}

export default function Legend({ activeLayers, zoom, sidebarOpen = false }: LegendProps) {
  const [expanded, setExpanded] = useState(false)

  const hasVisibleLegend =
    activeLayers.baseArea ||
    activeLayers.evacuation ||
    activeLayers.teamActivity

  if (!hasVisibleLegend) {
    return null
  }

  return (
    <div className={`absolute top-4 bg-white/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-3 max-w-xs z-20 transition-[left] duration-200 ${sidebarOpen ? 'left-3' : 'left-16 md:left-20'}`}>
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
          表示中: {[
            activeLayers.baseArea ? 'L1 ベースエリア' : null,
            activeLayers.evacuation ? 'L2 避難所' : null,
            activeLayers.teamActivity ? 'L3 チーム活動' : null,
          ].filter(Boolean).join(' / ')}
        </p>
      )}

      {expanded && (
        <div className="space-y-3 mt-3">
          {activeLayers.baseArea && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-1.5">L1 ベースエリア</div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-4 bg-blue-200/40 border border-blue-600 rounded"></div>
                <span className="text-xs text-gray-600">自治体境界・地区境界</span>
              </div>
            </div>
          )}

          {activeLayers.evacuation && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-1.5">L2 避難所</div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
                <span className="text-xs text-gray-600">避難所ポイント</span>
              </div>
            </div>
          )}

          {activeLayers.teamActivity && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-1.5">L3 チーム活動</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-red-600 border-2 border-white shadow-sm"></div>
                  <span className="text-xs text-gray-600">活動中</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white shadow-sm"></div>
                  <span className="text-xs text-gray-600">待機中</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-gray-500 border-2 border-white shadow-sm"></div>
                  <span className="text-xs text-gray-600">停止・不明</span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-gray-200">
            <p className="text-[10px] text-gray-500">現在のズーム: {zoom.toFixed(1)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
