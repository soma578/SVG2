'use client'

import { useEffect, useMemo, useState } from 'react'
import Map, { Layer, ScaleControl, Source } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

type OverviewLevel = 'nation' | 'prefecture'

type OverviewViewport = {
  lat: number
  lon: number
  zoom: number
}

type OverviewIndex = {
  generatedAt?: string
  prefectures: Array<{
    pref: string
    teamActivityCount: number
    lat: number
    lon: number
    latSpan: number
    lonSpan: number
    zoom: number
  }>
  municipalities: Array<{
    n03Code: string
    pref: string
    name: string
    teamActivityCount: number
    lat: number
    lon: number
    latSpan: number
    lonSpan: number
    zoom: number
  }>
}

type TopEntry =
  | {
      kind: 'prefecture'
      key: string
      label: string
      count: number
      pref: string
      lat: number
      lon: number
      latSpan?: number
      lonSpan?: number
      zoom?: number
    }
  | {
      kind: 'municipality'
      key: string
      label: string
      count: number
      n03Code: string
      pref: string
      name: string
      lat: number
      lon: number
      latSpan?: number
      lonSpan?: number
      zoom?: number
    }

type MunicipalitySelection = {
  n03Code: string
  pref: string
  name: string
  lat: number
  lon: number
  latSpan?: number
  lonSpan?: number
  zoom?: number
}

type Props = {
  level: OverviewLevel
  selectedPrefecture?: string | null
  initialViewport: OverviewViewport
  onViewportChange?: (viewport: OverviewViewport) => void
  onSelectPrefecture: (selection: {
    pref: string
    lat: number
    lon: number
    latSpan?: number
    lonSpan?: number
    zoom?: number
  }) => void
  onSelectMunicipality: (selection: MunicipalitySelection) => void
}

const overviewJsonCache = new globalThis.Map<string, Promise<any>>()

function loadJson(url: string) {
  const cached = overviewJsonCache.get(url)
  if (cached) return cached
  const next = fetch(url, { cache: 'force-cache' }).then((response) => {
    if (!response.ok) {
      throw new Error(`${url} (${response.status})`)
    }
    return response.json()
  })
  overviewJsonCache.set(url, next)
  return next
}

/** ポリゴンリングの符号付き面積(Shoelace) */
function ringArea(ring: number[][]): number {
  let area = 0
  for (let i = 0, len = ring.length; i < len - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return area / 2
}

/** ポリゴンリングの重心 */
function ringCentroid(ring: number[][]): [number, number] {
  let cx = 0, cy = 0, a = 0
  for (let i = 0, len = ring.length; i < len - 1; i++) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    cx += (ring[i][0] + ring[i + 1][0]) * cross
    cy += (ring[i][1] + ring[i + 1][1]) * cross
    a += cross
  }
  a /= 2
  if (Math.abs(a) < 1e-10) {
    // 面積がほぼ0の場合は座標平均で代替
    const sumX = ring.reduce((s, c) => s + c[0], 0)
    const sumY = ring.reduce((s, c) => s + c[1], 0)
    return [sumX / ring.length, sumY / ring.length]
  }
  return [cx / (6 * a), cy / (6 * a)]
}

/** Geometry 内の最大面積ポリゴンの重心と面積を返す */
function computeLargestPolygonCentroid(geometry: any): { centroid: [number, number] | null; area: number } {
  const polygons: number[][][] = []
  if (geometry.type === 'Polygon') {
    polygons.push(geometry.coordinates[0])
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      polygons.push(poly[0]) // outer ring
    }
  }
  if (polygons.length === 0) return { centroid: null, area: 0 }

  let bestRing = polygons[0]
  let bestArea = Math.abs(ringArea(polygons[0]))
  for (let i = 1; i < polygons.length; i++) {
    const a = Math.abs(ringArea(polygons[i]))
    if (a > bestArea) {
      bestArea = a
      bestRing = polygons[i]
    }
  }
  return { centroid: ringCentroid(bestRing), area: bestArea }
}

const MAPLIBRE_BASE_STYLE = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'overview-background',
      type: 'background',
      paint: {
        'background-color': '#f8fafc',
      },
    },
  ],
} as const

function buildCountColorExpression() {
  return [
    'step',
    ['coalesce', ['get', 'teamActivityCount'], 0],
    '#e5e7eb',
    1, '#dbeafe',
    3, '#93c5fd',
    6, '#60a5fa',
    10, '#3b82f6',
    20, '#1d4ed8',
  ] as any
}

function buildSelectedFillOpacityExpression(level: OverviewLevel, selectedPrefecture?: string | null) {
  if (level === 'nation' && selectedPrefecture) {
    return [
      'case',
      ['==', ['get', 'pref'], selectedPrefecture],
      0.9,
      ['==', ['coalesce', ['get', 'teamActivityCount'], 0], 0],
      0.28,
      0.72,
    ] as any
  }
  if (level === 'prefecture') {
    return [
      'case',
      ['==', ['coalesce', ['get', 'teamActivityCount'], 0], 0],
      0.22,
      0.82,
    ] as any
  }
  return 0.72
}

function buildOutlineWidthExpression(level: OverviewLevel, selectedPrefecture?: string | null) {
  if (level === 'nation' && selectedPrefecture) {
    return [
      'case',
      ['==', ['get', 'pref'], selectedPrefecture],
      2.4,
      1.1,
    ] as any
  }
  return level === 'nation' ? 1.1 : 0.8
}

function buildBreadcrumb(level: OverviewLevel, selectedPrefecture?: string | null) {
  if (level === 'nation') return '全国'
  return `全国 > ${selectedPrefecture ?? '都道府県'}`
}

export default function MapLibreOverviewMap({
  level,
  selectedPrefecture,
  initialViewport,
  onViewportChange,
  onSelectPrefecture,
  onSelectMunicipality,
}: Props) {
  const [overviewIndex, setOverviewIndex] = useState<OverviewIndex | null>(null)
  const [sourceData, setSourceData] = useState<any>(null)
  const [loadingSourceData, setLoadingSourceData] = useState(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [hoveredFeatureSummary, setHoveredFeatureSummary] = useState<{
    label: string
    count: number
    action: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    setOverviewError(null)
    loadJson('/search-index/japan-hierarchical-overview.json')
      .then((payload) => {
        if (!cancelled) setOverviewIndex(payload)
      })
      .catch((error) => {
        console.error('[overview] failed to load overview index:', error)
        if (!cancelled) {
          setOverviewIndex({ prefectures: [], municipalities: [] })
          setOverviewError('overview 集計データの読み込みに失敗しました。')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const prefectureMap = useMemo(
    () => new globalThis.Map((overviewIndex?.prefectures ?? []).map((entry) => [entry.pref, entry])),
    [overviewIndex]
  )
  const municipalityMap = useMemo(
    () => new globalThis.Map((overviewIndex?.municipalities ?? []).map((entry) => [entry.n03Code, entry])),
    [overviewIndex]
  )

  useEffect(() => {
    if (!overviewIndex) return
    let cancelled = false
    setLoadingSourceData(true)
    const sourceUrl =
      level === 'nation'
        ? '/data/source/national/prefectures-low.geojson'
        : '/data/source/n03_national_light.geojson'

    loadJson(sourceUrl)
      .then((geojson) => {
        if (cancelled) return
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        const enriched = features.flatMap((feature: any) => {
          const props = feature?.properties ?? {}
          if (level === 'nation') {
            const pref = String(props.pref || '').trim()
            const prefecture = prefectureMap.get(pref)
            return [{
              ...feature,
              properties: {
                ...props,
                pref,
                teamActivityCount: prefecture?.teamActivityCount ?? 0,
                lat: prefecture?.lat,
                lon: prefecture?.lon,
                latSpan: prefecture?.latSpan,
                lonSpan: prefecture?.lonSpan,
                zoom: prefecture?.zoom,
              },
            }]
          }

          const pref = String(props.pref || '').trim()
          if (!selectedPrefecture || pref !== selectedPrefecture) return []
          const n03Code = String(props.n03_code || '').trim()
          const municipality = municipalityMap.get(n03Code)
          return [{
            ...feature,
            properties: {
              ...props,
              teamActivityCount: municipality?.teamActivityCount ?? 0,
              lat: municipality?.lat,
              lon: municipality?.lon,
              latSpan: municipality?.latSpan,
              lonSpan: municipality?.lonSpan,
              zoom: municipality?.zoom,
            },
          }]
        })

        setSourceData({
          type: 'FeatureCollection',
          features: enriched,
        })
        setLoadingSourceData(false)
      })
      .catch((error) => {
        console.error('[overview] failed to load geojson:', error)
        if (!cancelled) {
          setSourceData(null)
          setLoadingSourceData(false)
          setOverviewError('overview 地図データの読み込みに失敗しました。')
        }
      })

    return () => {
      cancelled = true
    }
  }, [level, municipalityMap, overviewIndex, prefectureMap, selectedPrefecture])

  const featureCount = Array.isArray(sourceData?.features) ? sourceData.features.length : 0

  // ラベル用ポイントソース: ポリゴンの重心から1エンティティ1点を生成
  const labelData = useMemo(() => {
    if (!sourceData) return null
    // 重複キーで集約し、最大面積のポリゴン重心をラベル位置にする
    const labelKey = level === 'nation' ? 'pref' : 'name'
    const seen = new globalThis.Map<string, { lon: number; lat: number; area: number }>()

    for (const feature of sourceData.features) {
      const key = String(feature.properties?.[labelKey] || '').trim()
      if (!key) continue
      const { centroid, area } = computeLargestPolygonCentroid(feature.geometry)
      if (!centroid) continue
      const existing = seen.get(key)
      if (!existing || area > existing.area) {
        seen.set(key, { lon: centroid[0], lat: centroid[1], area })
      }
    }

    return {
      type: 'FeatureCollection' as const,
      features: Array.from(seen.entries()).map(([label, { lon, lat }]) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
        properties: { label },
      })),
    }
  }, [sourceData, level])

  const title = useMemo(() => {
    return level === 'nation'
      ? '全国 overview'
      : `${selectedPrefecture ?? '都道府県'} overview`
  }, [level, selectedPrefecture])
  const breadcrumb = useMemo(
    () => buildBreadcrumb(level, selectedPrefecture),
    [level, selectedPrefecture]
  )
  const subtitle = level === 'nation'
    ? '都道府県ごとの L3 拠点数'
    : '市区町村ごとの L3 拠点数'
  const summary = useMemo(() => {
    if (!overviewIndex) return null
    if (level === 'nation') {
      const activePrefectureCount = overviewIndex.prefectures.filter((entry) => entry.teamActivityCount > 0).length
      const totalActivityCount = overviewIndex.prefectures.reduce((sum, entry) => sum + entry.teamActivityCount, 0)
      return {
        primary: `活動あり ${activePrefectureCount} / ${overviewIndex.prefectures.length} 都道府県`,
        secondary: `L3 拠点 ${totalActivityCount} 件`,
      }
    }

    const entries = overviewIndex.municipalities.filter((entry) => entry.pref === selectedPrefecture)
    const activeMunicipalityCount = entries.filter((entry) => entry.teamActivityCount > 0).length
    const totalActivityCount = entries.reduce((sum, entry) => sum + entry.teamActivityCount, 0)
    return {
      primary: `活動あり ${activeMunicipalityCount} / ${entries.length} 市区町村`,
      secondary: `L3 拠点 ${totalActivityCount} 件`,
    }
  }, [level, overviewIndex, selectedPrefecture])
  const topEntries = useMemo<TopEntry[]>(() => {
    if (!overviewIndex) return []
    if (level === 'nation') {
      return [...overviewIndex.prefectures]
        .filter((entry) => entry.teamActivityCount > 0)
        .sort((a, b) => b.teamActivityCount - a.teamActivityCount)
        .slice(0, 5)
        .map((entry) => ({
          kind: 'prefecture' as const,
          key: entry.pref,
          label: entry.pref,
          count: entry.teamActivityCount,
          pref: entry.pref,
          lat: entry.lat,
          lon: entry.lon,
          latSpan: entry.latSpan,
          lonSpan: entry.lonSpan,
          zoom: entry.zoom,
        }))
    }

    return overviewIndex.municipalities
      .filter((entry) => entry.pref === selectedPrefecture && entry.teamActivityCount > 0)
      .sort((a, b) => b.teamActivityCount - a.teamActivityCount)
      .slice(0, 6)
      .map((entry) => ({
        kind: 'municipality' as const,
        key: entry.n03Code,
        label: entry.name,
        count: entry.teamActivityCount,
        n03Code: entry.n03Code,
        pref: entry.pref,
        name: entry.name,
        lat: entry.lat,
        lon: entry.lon,
        latSpan: entry.latSpan,
        lonSpan: entry.lonSpan,
        zoom: entry.zoom,
      }))
  }, [level, overviewIndex, selectedPrefecture])
  const hasAnyActivity = useMemo(() => {
    if (!summary) return false
    return /L3 拠点 0 件/.test(summary.secondary) === false
  }, [summary])

  const handleTopEntrySelect = (entry: TopEntry) => {
    if (entry.kind === 'prefecture') {
      onSelectPrefecture({
        pref: entry.pref,
        lat: entry.lat,
        lon: entry.lon,
        latSpan: entry.latSpan,
        lonSpan: entry.lonSpan,
        zoom: entry.zoom,
      })
      return
    }

    onSelectMunicipality({
      n03Code: entry.n03Code,
      pref: entry.pref,
      name: entry.name,
      lat: entry.lat,
      lon: entry.lon,
      latSpan: entry.latSpan,
      lonSpan: entry.lonSpan,
      zoom: entry.zoom,
    })
  }

  return (
    <div className="w-full h-full relative">
      <Map
        longitude={initialViewport.lon}
        latitude={initialViewport.lat}
        zoom={initialViewport.zoom}
        onMove={(event) => {
          onViewportChange?.({
            lat: event.viewState.latitude,
            lon: event.viewState.longitude,
            zoom: event.viewState.zoom,
          })
        }}
        onMouseMove={(event) => {
          const hoveredFeature = event.features?.find((feature: any) => feature?.layer?.id === 'overview-fill')
          if (!hoveredFeature) {
            setHoveredFeatureSummary(null)
            return
          }
          const props = hoveredFeature.properties ?? {}
          const name = level === 'nation'
            ? String(props.pref || '').trim()
            : String(props.name || '').trim()
          const count = Number(props.teamActivityCount)
          setHoveredFeatureSummary(name ? {
            label: name,
            count: Number.isFinite(count) ? count : 0,
            action: level === 'nation' ? 'クリックで県 overview へ' : 'クリックで詳細へ',
          } : null)
        }}
        onMouseLeave={() => setHoveredFeatureSummary(null)}
        interactiveLayerIds={['overview-fill']}
        onClick={(event) => {
          const clickedFeature = event.features?.find((feature: any) => feature?.layer?.id === 'overview-fill')
          if (!clickedFeature) return
          const props = clickedFeature.properties ?? {}

          if (level === 'nation') {
            const pref = String(props.pref || '').trim()
            const lat = Number(props.lat)
            const lon = Number(props.lon)
            if (pref && Number.isFinite(lat) && Number.isFinite(lon)) {
              onSelectPrefecture({
                pref,
                lat,
                lon,
                latSpan: Number(props.latSpan),
                lonSpan: Number(props.lonSpan),
                zoom: Number(props.zoom),
              })
            }
            return
          }

          const n03Code = String(props.n03_code || '').trim()
          const pref = String(props.pref || '').trim()
          const name = String(props.name || '').trim()
          const lat = Number(props.lat)
          const lon = Number(props.lon)
          if (!n03Code || !pref || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) return
          onSelectMunicipality({
            n03Code,
            pref,
            name,
            lat,
            lon,
            latSpan: Number(props.latSpan),
            lonSpan: Number(props.lonSpan),
            zoom: Number(props.zoom),
          })
        }}
        minZoom={4}
        maxZoom={12}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAPLIBRE_BASE_STYLE as any}
        cursor={hoveredFeatureSummary ? 'pointer' : 'grab'}
      >
        {sourceData && (
          <Source id="overview-source" type="geojson" data={sourceData}>
            <Layer
              id="overview-fill"
              type="fill"
              paint={{
                'fill-color': buildCountColorExpression(),
                'fill-opacity': buildSelectedFillOpacityExpression(level, selectedPrefecture),
              }}
            />
            <Layer
              id="overview-outline"
              type="line"
              paint={{
                'line-color': level === 'nation' ? '#334155' : '#64748b',
                'line-width': buildOutlineWidthExpression(level, selectedPrefecture),
                'line-opacity': 0.9,
              }}
            />
          </Source>
        )}
        {labelData && (
          <Source id="overview-label-source" type="geojson" data={labelData}>
            <Layer
              id="overview-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'label'],
                'text-size': level === 'nation' ? 12 : 11,
                'text-font': ['Noto Sans Regular'],
                'text-allow-overlap': false,
                'text-ignore-placement': false,
                'text-padding': 3,
              }}
              minzoom={level === 'nation' ? 4.5 : 7.2}
              paint={{
                'text-color': '#0f172a',
                'text-opacity': level === 'nation' ? 0.88 : 0.72,
                'text-halo-color': 'rgba(255,255,255,0.92)',
                'text-halo-width': 1.3,
              }}
            />
          </Source>
        )}
        <ScaleControl position="bottom-right" />
      </Map>

      <div className="absolute left-3 top-3 z-20 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
        <div className="text-[11px] font-medium text-gray-500">{breadcrumb}</div>
        <div className="font-semibold text-gray-900">{title}</div>
        <div className="text-gray-600">{subtitle}</div>
        {summary && (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{summary.primary}</span>
            <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">{summary.secondary}</span>
          </div>
        )}
        {topEntries.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {level === 'nation' ? 'L3 上位の都道府県' : 'L3 上位の市区町村'}
            </div>
            <div className="mt-2 space-y-1.5">
              {topEntries.map((entry, index) => (
                <button
                  key={`${entry.key}-${index}`}
                  type="button"
                  onClick={() => handleTopEntrySelect(entry)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left text-[12px] transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <span className="truncate font-medium text-slate-700">{entry.label}</span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
                    {entry.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 text-[11px] text-gray-500">
          {level === 'nation' ? '都道府県をクリックして県 overview へ' : '市区町村をクリックして詳細へ'}
        </div>
        {hoveredFeatureSummary && (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
            <div className="font-semibold text-slate-800">{hoveredFeatureSummary.label}</div>
            <div className="mt-0.5">L3 拠点 {hoveredFeatureSummary.count} 件</div>
            <div className="mt-0.5 text-slate-500">{hoveredFeatureSummary.action}</div>
          </div>
        )}
        {!hasAnyActivity && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            この範囲では L3 拠点がまだ登録されていません。
          </div>
        )}
        {!loadingSourceData && !overviewError && featureCount === 0 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
            表示対象が見つかりませんでした。県選択か overview データを確認してください。
          </div>
        )}
        {overviewError && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
            {overviewError}
          </div>
        )}
      </div>

      {loadingSourceData && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 backdrop-blur-[1px]">
          <div className="rounded-xl border border-slate-200 bg-white/95 px-4 py-2 text-sm text-slate-700 shadow">
            overview を読み込み中です...
          </div>
        </div>
      )}
    </div>
  )
}
