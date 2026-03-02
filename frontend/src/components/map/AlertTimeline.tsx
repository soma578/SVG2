'use client'

import { useMemo, useState, useEffect } from 'react'

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

type SheetMode = 'peek' | 'half' | 'full'

const alertTypeConfig = {
  weather: { label: '気象', icon: '🌤️', color: 'bg-blue-500' },
  power: { label: '停電', icon: '⚡', color: 'bg-red-500' },
  road: { label: '道路', icon: '🚗', color: 'bg-yellow-500' },
  river: { label: '河川', icon: '🌊', color: 'bg-cyan-500' },
  quake: { label: '地震', icon: '🏚️', color: 'bg-orange-500' },
  other: { label: 'その他', icon: 'ℹ️', color: 'bg-gray-500' },
} as const

export default function AlertTimeline({ onAlertSelect }: AlertTimelineProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [filterType, setFilterType] = useState<string>('all')
  const [sheetMode, setSheetMode] = useState<SheetMode>('peek')
  const [query, setQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

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

  const formatTime = (isoString: string) => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 60) return `${diffMins}分前`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}時間前`
    return `${Math.floor(diffMins / 1440)}日前`
  }

  const filteredAlerts = useMemo(() => {
    let list = filterType === 'all' ? alerts : alerts.filter(alert => alert.type === filterType)

    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((a) =>
        `${a.title} ${a.summary} ${a.areaText || ''} ${a.sourceName}`.toLowerCase().includes(q)
      )
    }

    list = [...list].sort((a, b) => {
      const at = new Date(a.publishedAt).getTime()
      const bt = new Date(b.publishedAt).getTime()
      return sortOrder === 'newest' ? bt - at : at - bt
    })

    return list
  }, [alerts, filterType, query, sortOrder])

  if (alerts.length === 0) {
    return null
  }

  const topAlerts = filteredAlerts.slice(0, 5)

  const nextSheetMode = () => {
    setSheetMode((prev) => (prev === 'peek' ? 'half' : prev === 'half' ? 'full' : 'peek'))
  }

  const sheetHeight = sheetMode === 'peek' ? 'min-h-[52px]' : sheetMode === 'half' ? 'max-h-[48vh]' : 'max-h-[76vh]'

  return (
    <div className={`absolute bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-2xl ${sheetHeight}`}>
      <button
        type="button"
        onClick={nextSheetMode}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-red-600 to-red-700"
      >
        <div className="flex items-center gap-2 text-white min-w-0">
          <span className="text-base">📢</span>
          <span className="text-sm font-bold truncate">速報タイムライン（{filteredAlerts.length}件）</span>
          {sheetMode === 'peek' && filteredAlerts[0] && (
            <span className="text-xs text-white/90 truncate">{filteredAlerts[0].title}</span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-white transition-transform ${sheetMode === 'peek' ? '' : sheetMode === 'half' ? 'rotate-180' : 'rotate-90'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {sheetMode !== 'peek' && (
        <div className="overflow-hidden flex flex-col">
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

          {sheetMode === 'full' && (
            <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="速報を検索"
                className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded"
              />
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                className="px-2 py-1.5 text-xs border border-gray-300 rounded"
              >
                <option value="newest">新しい順</option>
                <option value="oldest">古い順</option>
              </select>
            </div>
          )}

          <div className="overflow-y-auto">
            {(sheetMode === 'half' ? topAlerts : filteredAlerts).map((alert) => {
              const config = alertTypeConfig[alert.type]
              return (
                <button
                  key={alert.id}
                  onClick={() => onAlertSelect?.(alert)}
                  className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex gap-3 items-start">
                    <div className={`w-8 h-8 ${config.color} rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900 truncate">{alert.title}</div>
                        <div className="text-xs font-bold text-red-600 flex-shrink-0">{formatTime(alert.publishedAt)}</div>
                      </div>
                      <div className="text-xs text-gray-600 truncate">{alert.areaText || '場所情報なし'} / {alert.sourceName}</div>
                    </div>
                    <div className="text-xs text-blue-700 self-center whitespace-nowrap">地図へ</div>
                  </div>
                </button>
              )
            })}

            {filteredAlerts.length === 0 && (
              <div className="p-6 text-xs text-gray-500 text-center">該当する速報はありません</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
