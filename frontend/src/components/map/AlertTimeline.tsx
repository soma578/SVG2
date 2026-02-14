'use client'

import { useState, useEffect } from 'react'

export interface AlertItem {
  id: string
  publishedAt: string
  type: 'weather' | 'power' | 'road' | 'river' | 'quake' | 'other'
  title: string
  summary: string
  sourceName: string
  sourceUrl: string
  areaText?: string
  location?: {
    lat: number
    lon: number
  }
}

interface AlertTimelineProps {
  onAlertSelect?: (alert: AlertItem) => void
}

const alertTypeConfig = {
  weather: { label: '気象', icon: '🌤️', color: 'bg-blue-500' },
  power: { label: '停電', icon: '⚡', color: 'bg-red-500' },
  road: { label: '道路', icon: '🚗', color: 'bg-yellow-500' },
  river: { label: '河川', icon: '🌊', color: 'bg-cyan-500' },
  quake: { label: '地震', icon: '🏚️', color: 'bg-orange-500' },
  other: { label: 'その他', icon: 'ℹ️', color: 'bg-gray-500' },
}

export default function AlertTimeline({ onAlertSelect }: AlertTimelineProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [filterType, setFilterType] = useState<string>('all')
  const [isExpanded, setIsExpanded] = useState(false)

  // デモデータ（実際のRSS/JSONフィードに置き換え予定）
  useEffect(() => {
    const demoAlerts: AlertItem[] = [
      {
        id: '1',
        publishedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        type: 'weather',
        title: '大雨注意報',
        summary: '岡山市に大雨注意報が発表されました',
        sourceName: '気象庁',
        sourceUrl: 'https://www.jma.go.jp/',
        areaText: '岡山市',
        location: { lat: 34.66, lon: 133.93 },
      },
      {
        id: '2',
        publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        type: 'power',
        title: '停電情報',
        summary: '岡山市北区の一部で停電が発生しています',
        sourceName: '中国電力',
        sourceUrl: 'https://www.teideninfo.energia.co.jp/',
        areaText: '岡山市北区',
        location: { lat: 34.68, lon: 133.92 },
      },
      {
        id: '3',
        publishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        type: 'road',
        title: '道路規制情報',
        summary: '国道53号線で交通規制が実施されています',
        sourceName: '国土交通省',
        sourceUrl: 'https://www.mlit.go.jp/',
        areaText: '岡山市中区',
      },
      {
        id: '4',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        type: 'river',
        title: '河川水位情報',
        summary: '旭川の水位が上昇しています',
        sourceName: '国土交通省',
        sourceUrl: 'https://www.river.go.jp/',
        areaText: '岡山市',
        location: { lat: 34.67, lon: 133.93 },
      },
    ]

    setAlerts(demoAlerts)
  }, [])

  const filteredAlerts = filterType === 'all'
    ? alerts
    : alerts.filter(alert => alert.type === filterType)

  const formatTime = (isoString: string) => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) {
      return `${diffMins}分前`
    } else if (diffMins < 1440) {
      return `${Math.floor(diffMins / 60)}時間前`
    } else {
      return `${Math.floor(diffMins / 1440)}日前`
    }
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-2xl">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-red-600 to-red-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">📢</span>
          <h3 className="text-sm font-bold text-white">速報タイムライン</h3>
          {filteredAlerts.length > 0 && (
            <span className="bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              {filteredAlerts.length}件
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-white hover:bg-white/10 p-1 rounded transition-colors"
        >
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>

      {/* コンテンツ */}
      {isExpanded && (
        <div className="max-h-80 overflow-hidden flex flex-col">
          {/* フィルター */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 overflow-x-auto">
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  filterType === 'all'
                    ? 'bg-gray-700 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                }`}
              >
                すべて ({alerts.length})
              </button>
              {Object.entries(alertTypeConfig).map(([type, config]) => {
                const count = alerts.filter(a => a.type === type).length
                if (count === 0) return null
                return (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      filterType === type
                        ? `${config.color} text-white`
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {config.icon} {config.label} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {/* タイムライン */}
          <div className="flex-1 overflow-y-auto">
            {filteredAlerts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-2">📭</div>
                <div className="text-sm">速報情報はありません</div>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredAlerts.map(alert => {
                  const config = alertTypeConfig[alert.type]
                  return (
                    <button
                      key={alert.id}
                      onClick={() => onAlertSelect?.(alert)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex gap-3">
                        {/* アイコン */}
                        <div className="flex-shrink-0 mt-0.5">
                          <div className={`w-8 h-8 ${config.color} rounded-lg flex items-center justify-center text-white text-sm`}>
                            {config.icon}
                          </div>
                        </div>

                        {/* コンテンツ */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-gray-500">
                              {formatTime(alert.publishedAt)}
                            </span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.color} text-white`}>
                              {config.label}
                            </span>
                            {alert.areaText && (
                              <span className="text-xs text-gray-500">
                                📍 {alert.areaText}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-sm text-gray-900 mb-1">
                            {alert.title}
                          </div>
                          <div className="text-xs text-gray-600 line-clamp-2">
                            {alert.summary}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            出典: {alert.sourceName}
                          </div>
                        </div>

                        {/* 矢印 */}
                        <div className="flex-shrink-0 self-center">
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* フッター */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>ℹ️ クリックで地図にピン表示</span>
              <span className="text-yellow-600">⚠️ 現在はデモデータを表示中</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
