'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import Map, { NavigationControl, GeolocateControl, ScaleControl, Layer, Source, Marker, Popup } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import NearbyPortsPanel from './NearbyPortsPanel'
import CreditBadge from './CreditBadge'
import RiskCard from './RiskCard'
import Legend from './Legend'
import DebugPanel from './DebugPanel'
import AlertTimeline, { type AlertItem } from './AlertTimeline'
import { useDistrictLayers } from '@/hooks/useDistrictLayers'
import { useRiskAnalysis, type RiskInfo } from '@/hooks/useRiskAnalysis'
import { buildNormalizedKey, type OutageInfo, type DistrictDict, type MunicipalityDict } from '@/lib/outageMapper'
import { getFacilityTypeName, getFacilityTypeColor } from '@/lib/welfareFacilityTypes'
import { registerPMTilesProtocol } from '@/lib/pmtilesLoader'
import { useDebounce } from '@/hooks/useDebounce'

interface MapLibreMapProps {
  activeLayers: Record<string, boolean>
  showSidebar: boolean
  outageTimeRange?: string
  outageDemoMode?: boolean
  hazardOpacity?: number
  boundaryOpacity?: number
  initialViewport?: { lat: number; lon: number; zoom: number }
  onMapMove?: (viewport: { lat: number; lon: number; zoom: number }) => void
}

type PopupInfo = {
  longitude: number
  latitude: number
  name: string
  description?: string
  url?: string
  type?: string
  outageInfo?: {
    cause: string
    households: number
    timestamp: string
    status: string
    recovered_at?: string
  }
}

type SpiderNode = {
  id: string
  original: [number, number]
  expanded: [number, number]
  properties: Record<string, any>
}

export default function MapLibreMap({
  activeLayers,
  showSidebar,
  outageTimeRange = 'current',
  outageDemoMode = false,
  hazardOpacity = 0.6,
  boundaryOpacity = 0.7,
  initialViewport,
  onMapMove
}: MapLibreMapProps) {
  const mapRef = useRef<any>(null)
  const [viewport, setViewport] = useState({
    longitude: initialViewport?.lon ?? 133.93,
    latitude: initialViewport?.lat ?? 34.66,
    zoom: initialViewport?.zoom ?? 8.7,
  })
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null)
  const [momochariGeoJSON, setMomochariGeoJSON] = useState<any>(null)
  const [gpsPosition, setGpsPosition] = useState<[number, number] | null>(null)
  const [momochariBikes, setMomochariBikes] = useState<any[]>([])
  const [isFirstGpsUpdate, setIsFirstGpsUpdate] = useState(true)
  const [outageData, setOutageData] = useState<OutageInfo[]>([])
  const [districtDict, setDistrictDict] = useState<DistrictDict | null>(null)
  const [municipalityDict, setMunicipalityDict] = useState<MunicipalityDict | null>(null)
  const [municipalitiesGeoJSON, setMunicipalitiesGeoJSON] = useState<any>(null)
  const [welfareMunicipalityCenters, setWelfareMunicipalityCenters] = useState<Array<{ key: string; count: number; center: [number, number] }>>([])
  const [welfarePrefectureCounts, setWelfarePrefectureCounts] = useState<Array<{ pref: string; count: number; center: [number, number] }>>([])
  const [riskInfo, setRiskInfo] = useState<RiskInfo | null>(null)
  const [spotsGeoJSON, setSpotsGeoJSON] = useState<any>(null)
  const [searchHighlight, setSearchHighlight] = useState<{ lat: number; lon: number } | null>(null)
  const [alertPin, setAlertPin] = useState<{ lat: number; lon: number; alert: AlertItem } | null>(null)
  const [welfareSpider, setWelfareSpider] = useState<{ center: [number, number]; nodes: SpiderNode[] } | null>(null)
  const [welfareDisplayMode, setWelfareDisplayMode] = useState<'cluster' | '3d' | 'municipality'>('municipality')
  const [welfareMeshGeoJSON, setWelfareMeshGeoJSON] = useState<any>(null)
  const [welfareMunicipalityCounts, setWelfareMunicipalityCounts] = useState<Record<string, number>>({})
  const [welfareDistrictCounts, setWelfareDistrictCounts] = useState<Record<string, number>>({})
  const [welfarePrefectureCounts2, setWelfarePrefectureCounts2] = useState<Record<string, number>>({})
  const [welfareMunicipalityPolygonsBbox, setWelfareMunicipalityPolygonsBbox] = useState<any>(null)
  const [n03WithCountsGeoJSON, setN03WithCountsGeoJSON] = useState<any>(null)
  const [n03MunicipalitiesGeoJSON, setN03MunicipalitiesGeoJSON] = useState<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [debugStats, setDebugStats] = useState({
    layerCounts: {} as Record<string, number>,
    totalFeatures: 0,
    lastClickProcessingTime: undefined as number | undefined,
    lastPipTime: undefined as number | undefined,
    lastShelterSearchTime: undefined as number | undefined,
    pipCandidates: undefined as number | undefined,
  })

  // リスク分析フック
  const { analyzeRisk, loading: riskLoading, shelters, landslideZones } = useRiskAnalysis()

  const openWelfarePopup = (props: Record<string, any>, coords: [number, number]) => {
    console.log('[Welfare Popup] Props:', props)
    console.log('[Welfare Popup] Available keys:', Object.keys(props))

    // P14_006が施設種別コード（中分類）
    const facilityType = getFacilityTypeName(props.P14_006 || '')
    const facilityTypeCode = props.P14_006 || '不明'
    const capacity = props.P14_009 ? `定員: ${props.P14_009}名` : ''
    const facilityName = props.P14_008 || props.name || '老人福祉施設（名称不明）'
    const address = `${props.P14_002 || ''}` // P14_002は市町村名

    console.log('[Welfare Popup] Facility name:', facilityName)
    console.log('[Welfare Popup] Facility type:', facilityType)
    console.log('[Welfare Popup] P14_008 code:', facilityTypeCode)
    console.log('[Welfare Popup] Address:', address)

    setPopupInfo({
      longitude: coords[0],
      latitude: coords[1],
      name: `🏥 ${facilityName}`,
      description: `種別: ${facilityType}\n${address}${capacity ? '\n' + capacity : ''}`,
      type: 'welfare',
    })
  }

  const welfareSpiderLegs = useMemo(() => {
    if (!welfareSpider || welfareSpider.nodes.length === 0) return null
    return {
      type: 'FeatureCollection',
      features: welfareSpider.nodes.map((node) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [welfareSpider.center, node.expanded],
        },
        properties: {},
      })),
    } as any
  }, [welfareSpider])

  // 地区境界の遅延ロード（ズーム11+で表示）
  const {
    geojson: districtsGeoJSON,
    loading: districtsLoading,
    error: districtsError,
    featureCount
  } = useDistrictLayers(
    viewport.zoom,
    activeLayers.districts || activeLayers.welfare || (activeLayers.outages && viewport.zoom >= 11)
  )

  // ログ削減のためコメントアウト

  // レイヤーカウントの更新
  useEffect(() => {
    const counts: Record<string, number> = {}
    let total = 0

    if (activeLayers.landslide && landslideZones.length > 0) {
      counts['土砂災害'] = landslideZones.length
      total += landslideZones.length
    }
    if (activeLayers.realShelters && shelters.length > 0) {
      counts['避難所'] = shelters.length
      total += shelters.length
    }
    if (activeLayers.districts && districtsGeoJSON?.features) {
      counts['地区境界'] = districtsGeoJSON.features.length
      total += districtsGeoJSON.features.length
    }
    if (activeLayers.momochari && momochariGeoJSON?.features) {
      counts['ももちゃり'] = momochariGeoJSON.features.length
      total += momochariGeoJSON.features.length
    }
    if (activeLayers.spots && spotsGeoJSON?.features) {
      counts['スポット'] = spotsGeoJSON.features.length
      total += spotsGeoJSON.features.length
    }

    setDebugStats(prev => ({ ...prev, layerCounts: counts, totalFeatures: total }))
  }, [activeLayers, landslideZones, shelters, districtsGeoJSON, momochariGeoJSON, spotsGeoJSON])

  // 福祉施設レイヤーの可視性制御
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return

    const layerIds = [
      'welfare-points',            // PMTilesポイント（ズーム14+）
      'welfare-district-clusters', // 地区クラスター（ズーム11-14）
      'welfare-district-count',
      'welfare-muni-clusters',     // 市町村クラスター（ズーム8.7-11）
      'welfare-muni-count',
      'welfare-pref-cluster',      // 県クラスター（ズーム0-8.7）
      'welfare-pref-count',
    ]
    layerIds.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          'visibility',
          activeLayers.welfare ? 'visible' : 'none'
        )
      }
    })
  }, [activeLayers.welfare])

  useEffect(() => {
    setWelfareSpider(null)
  }, [viewport.zoom, activeLayers.welfare])

  // PMTilesプロトコルの登録（1回のみ）
  useEffect(() => {
    registerPMTilesProtocol()
  }, [])

  // 福祉施設GeoJSONロード（低ズームのクラスター表示用）
  const debouncedViewport = useDebounce(
    {
      longitude: viewport.longitude,
      latitude: viewport.latitude,
      zoom: viewport.zoom,
    },
    500 // 500ms待機
  )

  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !activeLayers.welfare || !map.getSource('welfare-geojson')) return

    // ズーム14以上ではGeoJSON不要（PMTilesが使われる）
    if (viewport.zoom >= 14) {
      console.log('[Welfare] Zoom >= 14, using PMTiles instead of GeoJSON')
      return
    }

    const bounds = map.getBounds()
    if (!bounds) return

    const west = bounds.getWest()
    const south = bounds.getSouth()
    const east = bounds.getEast()
    const north = bounds.getNorth()

    // ズームレベルに応じてlimit調整
    const limit = viewport.zoom < 10 ? 5000 : viewport.zoom < 12 ? 10000 : 30000

    // キャッシュキー生成
    const cacheKey = `${west.toFixed(2)},${south.toFixed(2)},${east.toFixed(2)},${north.toFixed(2)},${limit}`

    // キャッシュチェック
    const cached = sessionStorage.getItem(`welfare-cache-${cacheKey}`)
    if (cached) {
      try {
        const data = JSON.parse(cached)
        const source: any = map.getSource('welfare-geojson')
        if (source?.setData) {
          source.setData(data)
          console.log(`[Welfare] Cache hit (${data.features?.length || 0} facilities)`)
        }
        return
      } catch (err) {
        console.warn('[Welfare] Cache parse error:', err)
      }
    }

    // APIリクエスト
    const startTime = performance.now()
    fetch(`/api/welfare?west=${west}&south=${south}&east=${east}&north=${north}&limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        const source: any = map.getSource('welfare-geojson')
        if (source?.setData) {
          source.setData(data)

          // キャッシュに保存
          const jsonStr = JSON.stringify(data)
          if (jsonStr.length < 10 * 1024 * 1024) {
            try {
              sessionStorage.setItem(`welfare-cache-${cacheKey}`, jsonStr)
            } catch (err) {
              console.warn('[Welfare] Cache full, clearing old entries')
              const keys = Object.keys(sessionStorage).filter(k => k.startsWith('welfare-cache-'))
              keys.slice(0, Math.floor(keys.length / 2)).forEach(k => sessionStorage.removeItem(k))
            }
          }

          const elapsed = performance.now() - startTime
          console.log(`[Welfare] Loaded ${data.features?.length || 0} facilities in ${elapsed.toFixed(0)}ms (zoom ${viewport.zoom.toFixed(1)})`)
        }
      })
      .catch((err) => {
        console.error('[Welfare] Failed to load:', err)
      })
  }, [debouncedViewport.longitude, debouncedViewport.latitude, debouncedViewport.zoom, activeLayers.welfare])

  // 福祉施設の市区町村別集計データロード
  useEffect(() => {
    if (!activeLayers.welfare) return
    fetch('/api/welfare/municipality-centers')
      .then((r) => r.json())
      .then((data) => {
        setWelfareMunicipalityCenters(Array.isArray(data.municipalities) ? data.municipalities : [])
      })
      .catch((err) => {
        console.error('[Welfare] Failed to load municipality centers:', err)
      })

    fetch('/api/welfare/prefecture-counts')
      .then((r) => r.json())
      .then((data) => {
        setWelfarePrefectureCounts(Array.isArray(data.prefectures) ? data.prefectures : [])
      })
      .catch((err) => {
        console.error('[Welfare] Failed to load prefecture counts:', err)
      })
  }, [activeLayers.welfare])

  // 福祉施設レイヤーの表示モード切替
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !activeLayers.welfare) {
      console.log('[Welfare] Visibility useEffect early return:', {
        hasMap: !!map,
        welfareActive: activeLayers.welfare
      })
      return
    }

    // 全ての福祉レイヤーの表示/非表示を制御

    // 県クラスターレイヤー（ズーム0-8.7）
    const prefClusterLayers = ['welfare-pref-cluster', 'welfare-pref-count']
    prefClusterLayers.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', welfareDisplayMode === 'cluster' ? 'visible' : 'none')
      }
    })

    // 市町村クラスターレイヤー（ズーム8.7-11）
    const muniClusterLayers = ['welfare-muni-clusters', 'welfare-muni-count']
    muniClusterLayers.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', welfareDisplayMode === 'cluster' ? 'visible' : 'none')
      }
    })

    // 地区クラスターレイヤー（ズーム11-14）
    const districtClusterLayers = ['welfare-district-clusters', 'welfare-district-count']
    districtClusterLayers.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', welfareDisplayMode === 'cluster' ? 'visible' : 'none')
      }
    })

    // 3Dレイヤーの表示/非表示
    if (map.getLayer('welfare-3d')) {
      map.setLayoutProperty('welfare-3d', 'visibility', welfareDisplayMode === '3d' ? 'visible' : 'none')
    }

    // 市町村/県ポリゴンレイヤーの表示/非表示（市町村モード時は常に表示）
    if (map.getLayer('n03-municipalities-fill')) {
      const showN03 = welfareDisplayMode === 'municipality'
      map.setLayoutProperty('n03-municipalities-fill', 'visibility', showN03 ? 'visible' : 'none')
      console.log(`[Welfare] N03 fill visibility: ${showN03 ? 'visible' : 'none'}`)
    }

    // 市町村/県境界線レイヤーの表示/非表示
    if (map.getLayer('n03-municipalities-outline')) {
      const showN03Outline = welfareDisplayMode === 'municipality'
      map.setLayoutProperty('n03-municipalities-outline', 'visibility', showN03Outline ? 'visible' : 'none')
    }

    // PMTiles個別ポイントレイヤーの表示/非表示（ズーム14+、クラスターモード時のみ）
    if (map.getLayer('welfare-points')) {
      map.setLayoutProperty('welfare-points', 'visibility', welfareDisplayMode === 'cluster' ? 'visible' : 'none')
    }

    console.log(`[Welfare] Display mode changed to: ${welfareDisplayMode}`)

    // 3Dモード時は視点を傾ける
    if (welfareDisplayMode === '3d' && activeLayers.welfare) {
      map.easeTo({
        pitch: 60, // 60度傾ける
        bearing: 0,
        duration: 1000
      })
      console.log('[Welfare] Tilted camera to pitch=60 for 3D mode')
    } else if (welfareDisplayMode !== '3d') {
      // 他のモードに戻したら視点を戻す
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1000
      })
      console.log('[Welfare] Reset camera to pitch=0')
    }
  }, [welfareDisplayMode, activeLayers.welfare, mapLoaded, viewport.zoom])

  // 福祉施設メッシュデータの読み込み（3Dモード用）
  useEffect(() => {
    if (!activeLayers.welfare || welfareDisplayMode !== '3d') return

    fetch('/api/welfare/mesh')
      .then((r) => r.json())
      .then((data) => {
        setWelfareMeshGeoJSON(data)
        console.log(`[Welfare] Loaded ${data.features?.length || 0} mesh cells`)
      })
      .catch((err) => {
        console.error('[Welfare] Failed to load mesh data:', err)
      })
  }, [activeLayers.welfare, welfareDisplayMode])

  // 福祉施設市町村施設数カウントの読み込み（事前計算済みJSON）
  useEffect(() => {
    if (!activeLayers.welfare) {
      console.log('[Welfare] Layer is OFF, skipping load')
      return
    }

    console.log('[Welfare] Loading municipality counts...')
    fetch('/welfare_municipality_counts.json')
      .then((r) => {
        console.log('[Welfare] Fetch response status:', r.status)
        return r.json()
      })
      .then((data) => {
        console.log('[Welfare] Data loaded:', {
          municipalities: Object.keys(data.municipalityCounts || {}).length,
          prefectures: Object.keys(data.prefectureCounts || {}).length
        })
        setWelfareMunicipalityCounts(data.municipalityCounts || {})
        setWelfarePrefectureCounts2(data.prefectureCounts || {})
      })
      .catch((err) => {
        console.error('[Welfare] Failed to load counts:', err)
      })
  }, [activeLayers.welfare])

  // 地区カウントを読み込み（事前計算済みJSON、岡山県のみ）
  useEffect(() => {
    if (!activeLayers.welfare || welfareDisplayMode !== 'municipality') return

    fetch('/welfare_district_counts.json')
      .then((r) => r.json())
      .then((data) => {
        setWelfareDistrictCounts(data.counts || {})
        console.log('[Welfare] District counts loaded:', Object.keys(data.counts || {}).length)
      })
      .catch((err) => {
        console.error('[Welfare] Failed to load district counts:', err)
      })
  }, [activeLayers.welfare, welfareDisplayMode])

  // bbox版のポリゴンは不要（N03 PMTilesを使用）

  // 地区クラスター用の施設データ読み込み（ズーム11+、クラスターモード時）
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !activeLayers.welfare || welfareDisplayMode !== 'cluster' || viewport.zoom < 11) return

    const source = map.getSource('welfare-geojson') as maplibregl.GeoJSONSource
    if (!source) return

    // 現在の表示範囲を取得
    const bounds = map.getBounds()
    const west = bounds.getWest()
    const south = bounds.getSouth()
    const east = bounds.getEast()
    const north = bounds.getNorth()

    // APIから施設データを取得
    fetch(`/api/welfare?west=${west}&south=${south}&east=${east}&north=${north}&limit=10000`)
      .then(r => r.json())
      .then(data => {
        // GeoJSONに変換
        const geojson = {
          type: 'FeatureCollection',
          features: data.facilities.map((f: any) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [f.lon, f.lat]
            },
            properties: {
              name: f.name,
              type: f.type
            }
          }))
        }

        source.setData(geojson as any)
        console.log(`[Welfare] Loaded ${data.facilities.length} facilities for district clustering`)
      })
      .catch(err => console.error('[Welfare] Failed to load district cluster data:', err))
  }, [activeLayers.welfare, welfareDisplayMode, viewport.zoom, viewport.latitude, viewport.longitude])

  // 市町村レベルのヒートマップ（シンプル版、match式のみ）
  useEffect(() => {
    const map = mapRef.current?.getMap()

    console.log('[Heatmap] useEffect called:', {
      hasMap: !!map,
      welfareActive: activeLayers.welfare,
      displayMode: welfareDisplayMode,
      countsLoaded: Object.keys(welfareMunicipalityCounts).length,
      mapLoaded
    })

    if (!map || !mapLoaded || !activeLayers.welfare || welfareDisplayMode !== 'municipality') {
      console.log('[Heatmap] Early return')
      return
    }

    const layer = map.getLayer('n03-municipalities-fill')
    if (!layer) {
      console.warn('[Heatmap] Layer not found')
      return
    }

    if (Object.keys(welfareMunicipalityCounts).length === 0) {
      console.warn('[Heatmap] No counts data')
      return
    }

    console.log('[Heatmap] Applying colors...')

    // プロパティ名を試す（tippecanoeが小文字化する可能性）
    const propNames = ['N03_007', 'n03_007', 'N03_07']

    for (const propName of propNames) {
      const matchExpr: any = ['match', ['get', propName]]
      for (const [code, count] of Object.entries(welfareMunicipalityCounts)) {
        matchExpr.push(code, count)
      }
      matchExpr.push(0)  // デフォルト

      const colorExpr = [
        'interpolate', ['linear'], matchExpr,
        0, '#dbeafe',
        10, '#7dd3fc',
        50, '#22c55e',
        100, '#eab308',
        200, '#f97316',
        500, '#b91c1c'
      ]

      try {
        map.setPaintProperty('n03-municipalities-fill', 'fill-color', colorExpr)
        console.log(`[Heatmap] ✓ Applied with property: ${propName}`)
        return  // 成功したら終了
      } catch (err) {
        console.log(`[Heatmap] Failed with ${propName}:`, err)
      }
    }

    console.error('[Heatmap] All property names failed')
  }, [welfareMunicipalityCounts, activeLayers.welfare, welfareDisplayMode, mapLoaded])

  // スポットデータの読み込み
  useEffect(() => {
    fetch('/okayama_spots.geojson')
      .then(r => r.json())
      .then(data => setSpotsGeoJSON(data))
      .catch(err => console.error('[Spots] Failed to load:', err))
  }, [])

  // ももちゃりデータをGeoJSON形式に変換
  useEffect(() => {
    if (!activeLayers.momochari) return

    fetch('/momochari_with_rank.json')
      .then(res => res.json())
      .then(data => {
        const geojson = {
          type: 'FeatureCollection',
          features: data.map((port: any) => ({
            type: 'Feature',
            properties: {
              id: port.id,
              address: port.address,
              floodRank: port.floodRank,
            },
            geometry: {
              type: 'Point',
              coordinates: [port.lon, port.lat],
            },
          })),
        }
        setMomochariGeoJSON(geojson)
        // NearbyPortsPanel用のbikesデータを保存
        setMomochariBikes(data.map((port: any) => ({
          id: port.id,
          lat: port.lat,
          lon: port.lon,
          status: port.status,
        })))
      })
      .catch(err => console.error('Failed to load momochari data:', err))
  }, [activeLayers.momochari])

  // クリックイベントハンドラ
  const handleMapClick = (e: any) => {
    const features = e.features
    if (!features || features.length === 0) {
      setWelfareSpider(null)
      return
    }

    console.log('Clicked features:', features.map((f: any) => ({ id: f.layer.id, props: f.properties })))

    // 福祉施設地区クラスターをクリック（ズームイン）
    const districtClusterFeature = features.find((f: any) => f.layer.id === 'welfare-district-clusters')
    if (districtClusterFeature) {
      const map = mapRef.current?.getMap()
      if (map) {
        const source: any = map.getSource('welfare-geojson')
        const clusterId = districtClusterFeature.properties?.cluster_id
        if (source?.getClusterExpansionZoom && clusterId !== undefined) {
          source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
            if (err) return
            map.easeTo({
              center: e.lngLat,
              zoom: Math.min(zoom, 16),
              duration: 600,
            })
          })
        } else {
          map.flyTo({
            center: e.lngLat,
            zoom: Math.min(map.getZoom() + 2, 16),
            duration: 800
          })
        }
      }
      return
    }

    // 停電レイヤーをクリック（最優先）
    const outageFeature = features.find((f: any) =>
      f.layer.id === 'outages-district-fill' ||
      f.layer.id === 'outages-municipality-fill' ||
      f.layer.id === 'outages-district-label'
    )

    console.log('[Outage Click] Features:', features.length, 'Outage feature found:', !!outageFeature, 'Layer:', outageFeature?.layer?.id)
    console.log('[Outage Click] outageData length:', outageData.length)
    if (outageData.length > 0) {
      console.log('[Outage Click] Sample outage:', outageData[0])
    }

    if (outageFeature && outageFeature.properties.outage) {
      console.log('[Outage Click] Outage feature properties:', outageFeature.properties)
      const props = outageFeature.properties

      // この地区/市区町村の停電情報を検索
      let matchedOutage: OutageInfo | undefined

      if (props.key_code) {
        // 地区レベル
        console.log('[Outage Click] District search with key_code:', props.key_code)
        console.log('[Outage Click] districtDict available:', !!districtDict)

        matchedOutage = outageData.find(o => {
          if (!o.district) return false
          const normalizedKey = buildNormalizedKey(o)
          const dictEntry = districtDict && districtDict[normalizedKey]
          console.log('[Outage Click]   Checking:', { district: o.district, normalizedKey, hasEntry: !!dictEntry, entryKeyCode: dictEntry?.key_code, matches: dictEntry?.key_code === props.key_code })
          return dictEntry && dictEntry.key_code === props.key_code
        })
        console.log('[Outage Click] District search result:', { found: !!matchedOutage })
      } else if (props.name) {
        // 市区町村レベル
        console.log('[Outage Click] Municipality search with name:', props.name)

        matchedOutage = outageData.find(o => {
          const cityPart = o.ward
            ? (o.city && o.city.includes('郡') && (o.ward.includes('町') || o.ward.includes('村'))
              ? o.ward
              : `${o.city}${o.ward}`)
            : o.city || ''
          const cityName = `${o.prefecture || ''} ${cityPart}`.trim()
          console.log('[Outage Click]   Checking:', { cityName, propsName: props.name, matches: cityName === props.name })
          return cityName === props.name
        })
        console.log('[Outage Click] Municipality search result:', { found: !!matchedOutage })
      }

      // マッチングが失敗した場合のフォールバック（最初の停電データを使用）
      if (!matchedOutage && outageData.length > 0) {
        console.warn('[Outage Click] No exact match, using first outage as fallback')
        matchedOutage = outageData[0]
      }

      if (matchedOutage) {
        // 中心座標を計算
        const center = props.centroid_lon && props.centroid_lat
          ? [props.centroid_lon, props.centroid_lat]
          : e.lngLat ? [e.lngLat.lng, e.lngLat.lat] : [133.93, 34.66]

        const locationName = matchedOutage.district
          ? `${matchedOutage.city}${matchedOutage.ward || ''} ${matchedOutage.district}`
          : `${matchedOutage.city}${matchedOutage.ward || ''}`

        console.log('[Outage Click] Showing popup for:', locationName)

        setPopupInfo({
          longitude: center[0],
          latitude: center[1],
          name: `⚡ ${locationName}`,
          description: `停電が発生しています`,
          type: 'outage',
          outageInfo: {
            cause: matchedOutage.cause || '原因不明',
            households: matchedOutage.households || 0,
            timestamp: matchedOutage.timestamp || '',
            status: matchedOutage.status || 'ongoing',
            recovered_at: matchedOutage.recovered_at
          }
        })
        return
      } else {
        console.error('[Outage Click] No outage data available')
      }
    }

    // 観光スポットをクリック
    const spotFeature = features.find((f: any) => f.layer.id === 'spots-layer')
    if (spotFeature) {
      console.log('Spot clicked:', spotFeature.properties)
      const props = spotFeature.properties
      const coords = (spotFeature.geometry as any).coordinates
      setPopupInfo({
        longitude: coords[0],
        latitude: coords[1],
        name: props.name,
        description: props.description,
        url: props.url,
        type: props.type || 'tourist',
      })
      return
    }

    // ももちゃりポートをクリック
    const momochariFeature = features.find((f: any) => f.layer.id === 'momochari-layer')
    if (momochariFeature) {
      console.log('Momochari clicked:', momochariFeature.properties)
      const props = momochariFeature.properties
      const coords = (momochariFeature.geometry as any).coordinates
      // <br>タグを除去または改行に変換
      const cleanName = (props.id || 'ももちゃりポート').replace(/<br\s*\/?>/gi, ' ')
      const cleanAddress = (props.address || '').replace(/<br\s*\/?>/gi, ' ')
      setPopupInfo({
        longitude: coords[0],
        latitude: coords[1],
        name: cleanName,
        description: cleanAddress,
        url: 'https://www.okayama-kuko.co.jp/momochari/',
        type: 'momochari',
      })
      return
    }

    // 避難所をクリック
    const shelterFeature = features.find((f: any) => f.layer.id === 'shelters-layer')
    if (shelterFeature) {
      console.log('Shelter clicked:', shelterFeature.properties)
      const props = shelterFeature.properties
      const coords = (shelterFeature.geometry as any).coordinates
      setPopupInfo({
        longitude: coords[0],
        latitude: coords[1],
        name: props.P20_002 || props.name || '避難所',
        description: props.P20_003 || props.address || '',
        type: 'shelter',
      })
      return
    }

    // 福祉施設をクリック
    const welfareFeature = features.find((f: any) => f.layer.id === 'welfare-points')
    if (welfareFeature) {
      console.log('Welfare facility clicked:', welfareFeature.properties)
      const map = mapRef.current?.getMap()
      const clickPoint = e.point
      const nearby = map && clickPoint
        ? map.queryRenderedFeatures(
            [
              [clickPoint.x - 16, clickPoint.y - 16],
              [clickPoint.x + 16, clickPoint.y + 16],
            ],
            { layers: ['welfare-points'] }
          )
        : []

      const uniqueMap = new globalThis.Map<string, any>()
      for (const f of nearby) {
        const c = (f.geometry as any)?.coordinates
        if (!c) continue
        const key = `${Number(c[0]).toFixed(7)}_${Number(c[1]).toFixed(7)}_${f.properties?.P14_007 || ''}`
        if (!uniqueMap.has(key)) uniqueMap.set(key, f)
      }
      const uniqueFeatures = Array.from(uniqueMap.values())

      if (uniqueFeatures.length > 1 && map) {
        const center = (welfareFeature.geometry as any).coordinates as [number, number]
        const centerPoint = map.project({ lng: center[0], lat: center[1] })
        const radius = Math.max(28, Math.min(62, 18 + uniqueFeatures.length * 4))
        const step = (2 * Math.PI) / uniqueFeatures.length

        const nodes: SpiderNode[] = uniqueFeatures.map((f, idx) => {
          const angle = -Math.PI / 2 + idx * step
          const px = { x: centerPoint.x + Math.cos(angle) * radius, y: centerPoint.y + Math.sin(angle) * radius }
          const expanded = map.unproject(px)
          return {
            id: `${idx}-${f.properties?.P14_007 || 'welfare'}`,
            original: (f.geometry as any).coordinates as [number, number],
            expanded: [expanded.lng, expanded.lat],
            properties: f.properties || {},
          }
        })

        setWelfareSpider({ center, nodes })
        setPopupInfo(null)
        return
      }

      setWelfareSpider(null)
      openWelfarePopup(welfareFeature.properties || {}, (welfareFeature.geometry as any).coordinates as [number, number])
      return
    }

    // 何もクリックされていない場合は、地点のリスク評価を実施
    if (e.lngLat && !riskLoading) {
      console.log('Empty map clicked - analyzing risk at:', e.lngLat)
      const clickStartTime = performance.now()

      const risk = analyzeRisk(e.lngLat.lat, e.lngLat.lng, districtsGeoJSON, (debugInfo) => {
        setDebugStats(prev => ({
          ...prev,
          lastPipTime: debugInfo.pipTime,
          lastShelterSearchTime: debugInfo.shelterSearchTime,
          pipCandidates: debugInfo.pipCandidates,
        }))
      })

      const clickEndTime = performance.now()
      setDebugStats(prev => ({
        ...prev,
        lastClickProcessingTime: clickEndTime - clickStartTime,
      }))

      if (risk) {
        setPopupInfo(null) // 通常のポップアップを閉じる
        setRiskInfo(risk)
      }
    }
  }

  // マウス移動時のカーソル変更
  const handleMouseMove = (e: any) => {
    const map = mapRef.current?.getMap()
    if (!map) return

    const features = e.features
    if (features && features.length > 0) {
      const hasClickableFeature = features.some((f: any) =>
        f.layer.id === 'spots-layer' ||
        f.layer.id === 'momochari-layer' ||
        f.layer.id === 'shelters-layer' ||
        f.layer.id === 'welfare-district-clusters' ||
        f.layer.id === 'welfare-points' ||
        f.layer.id === 'outages-district-label' ||
        (f.layer.id === 'outages-district-fill' && f.properties.outage) ||
        (f.layer.id === 'outages-municipality-fill' && f.properties.outage)
      )
      map.getCanvas().style.cursor = hasClickableFeature ? 'pointer' : ''
    } else {
      map.getCanvas().style.cursor = ''
    }
  }

  // 近くのポートクリック時のハンドラ
  const handlePortClick = (bike: any) => {
    // 地図を該当ポートに移動
    setViewport({
      longitude: bike.lon,
      latitude: bike.lat,
      zoom: 15,
    })
    // ポップアップを表示
    const cleanName = (bike.id || 'ももちゃりポート').replace(/<br\s*\/?>/gi, ' ')
    setPopupInfo({
      longitude: bike.lon,
      latitude: bike.lat,
      name: cleanName,
      description: bike.address || '',
      url: 'https://www.okayama-kuko.co.jp/momochari/',
      type: 'momochari',
    })
  }

  // アラート選択時のハンドラ
  const handleAlertSelect = (alert: AlertItem) => {
    console.log('[Alert] Selected:', alert)

    if (alert.location) {
      // 地図を移動
      setViewport({
        longitude: alert.location.lon,
        latitude: alert.location.lat,
        zoom: 14,
      })

      // ピンを表示
      setAlertPin({
        lat: alert.location.lat,
        lon: alert.location.lon,
        alert,
      })

      // 5秒後にピンを消す
      setTimeout(() => setAlertPin(null), 5000)
    }
  }

  // 検索結果選択時のハンドラ
  const handleSearchResultSelect = (result: any) => {
    console.log('[Search] Result selected:', result)

    // 地図を移動
    setViewport({
      longitude: result.lon,
      latitude: result.lat,
      zoom: result.type === 'district' ? 14 : 16,
    })

    // ハイライトを設定
    setSearchHighlight({ lat: result.lat, lon: result.lon })

    // 3秒後にハイライトを消す
    setTimeout(() => setSearchHighlight(null), 3000)

    // リスク評価を実施（地区の場合）
    if (result.type === 'district') {
      const clickStartTime = performance.now()
      const risk = analyzeRisk(result.lat, result.lon, districtsGeoJSON, (debugInfo) => {
        setDebugStats(prev => ({
          ...prev,
          lastPipTime: debugInfo.pipTime,
          lastShelterSearchTime: debugInfo.shelterSearchTime,
          pipCandidates: debugInfo.pipCandidates,
        }))
      })
      const clickEndTime = performance.now()
      setDebugStats(prev => ({
        ...prev,
        lastClickProcessingTime: clickEndTime - clickStartTime,
      }))

      if (risk) {
        setPopupInfo(null)
        setRiskInfo(risk)
      }
    } else {
      // 施設の場合はポップアップを表示
      setRiskInfo(null)
      setPopupInfo({
        longitude: result.lon,
        latitude: result.lat,
        name: result.name,
        description: result.address || '',
        type: result.type,
      })
    }
  }

  // マップのロード完了時
  const handleMapLoad = () => {
    const map = mapRef.current?.getMap()
    if (!map) return
    console.log('[Map] Map loaded, overzoom enabled')
    setMapLoaded(true)

    // 福祉施設ソースを追加（ハイブリッドアプローチ）
    // ズーム 8-13: GeoJSONクラスター（円表示）
    // ズーム 14+: PMTiles個別ポイント（APIリクエスト不要）

    // GeoJSONソース（地区レベルクラスター用、ズーム11-14）
    if (!map.getSource('welfare-geojson')) {
      map.addSource('welfare-geojson', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
        cluster: true,
        clusterMaxZoom: 13,  // ズーム13までクラスター化
        clusterRadius: 60,
      })

      // 地区クラスター円（ズーム11-14）
      map.addLayer({
        id: 'welfare-district-clusters',
        type: 'circle',
        source: 'welfare-geojson',
        filter: ['has', 'point_count'],
        layout: { visibility: 'none' },
        minzoom: 11,
        maxzoom: 14,
        paint: {
          'circle-radius': [
            'interpolate',
            ['exponential', 1.5],
            ['get', 'point_count'],
            1, 10,      // 1件: 10px
            5, 15,      // 5件: 15px
            10, 20,     // 10件: 20px
            20, 28,     // 20件: 28px
            50, 38      // 50件: 38px
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'point_count'],
            1, '#dbeafe',      // 1件: 薄い青
            5, '#7dd3fc',      // 5件: 水色
            10, '#22c55e',     // 10件: 緑
            20, '#eab308',     // 20件: 黄
            30, '#f97316',     // 30件: オレンジ
            50, '#ef4444'      // 50件: 赤
          ],
          'circle-opacity': 0.6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      })

      // 地区クラスターカウント（テキスト）
      map.addLayer({
        id: 'welfare-district-count',
        type: 'symbol',
        source: 'welfare-geojson',
        filter: ['has', 'point_count'],
        minzoom: 11,
        maxzoom: 14,
        layout: {
          visibility: 'none',
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 13
        },
        paint: {
          'text-color': '#ffffff'
        }
      })

      console.log('[Welfare] District cluster layers added (zoom 11-14)')
    }

    // PMTilesソース（個別ポイント用）
    if (!map.getSource('welfare-pmtiles')) {
      map.addSource('welfare-pmtiles', {
        type: 'vector',
        url: 'pmtiles:///tiles/welfare_roujin.pmtiles',
      })

      // 福祉施設ポイント（ズーム14+、クラスターモード時のみ）
      map.addLayer({
        id: 'welfare-points',
        type: 'circle',
        source: 'welfare-pmtiles',
        'source-layer': 'welfare',
        layout: { visibility: 'none' },  // デフォルトは非表示
        minzoom: 14,  // ズーム14以上で表示
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 8,     // ズーム14: クリック可能なサイズ
            16, 12,    // ズーム16: 詳細表示
            18, 16     // ズーム18: 最大サイズ
          ],
          // 施設種別で色分け（P14_006）
          'circle-color': [
            'match',
            ['get', 'P14_006'], // 施設種別コード（中分類）
            '0201', '#dc2626',   // 養護老人ホーム: 赤
            '0202', '#ea580c',   // ケアハウス: オレンジ
            '0203', '#ca8a04',   // 老人福祉センター: 黄
            '0204', '#16a34a',   // デイサービスセンター: 緑
            '0205', '#0891b2',   // 短期入所生活介護: シアン
            '0206', '#2563eb',   // 在宅介護支援センター: 青
            '0207', '#7c3aed',   // 生活支援ハウス: 紫
            '0299', '#6b7280',   // その他: グレー
            '#9ca3af'            // 不明: ライトグレー
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        }
      })

      console.log('[Welfare] PMTiles layers (points) added (zoom 14+)')
    }

    // N03市町村ポリゴンPMTilesソース（市町村コロプレスマップ用）
    if (!map.getSource('n03-municipalities')) {
      console.log('[N03] Adding n03-municipalities source and layers')

      map.addSource('n03-municipalities', {
        type: 'vector',
        url: 'pmtiles:///tiles/n03_municipalities.pmtiles',
      })

      // 市町村ポリゴン塗りつぶし（施設数で色分け、全ズームレベル対応）
      // 色はuseEffectで動的に設定される（県レベル z<8.7、市町村レベル z8.7-11）
      map.addLayer({
        id: 'n03-municipalities-fill',
        type: 'fill',
        source: 'n03-municipalities',
        'source-layer': 'municipalities',
        layout: { visibility: 'none' },
        // minzoom/maxzoomなし - 全ズームレベルで使用可能
        paint: {
          'fill-color': '#dbeafe',  // デフォルト（useEffectで上書きされる）
          'fill-opacity': 0.7,
        }
      })

      console.log('[N03] Added n03-municipalities-fill layer (全ズーム対応)')

      // 市町村境界線（全ズームレベルで表示可能）
      map.addLayer({
        id: 'n03-municipalities-outline',
        type: 'line',
        source: 'n03-municipalities',
        'source-layer': 'municipalities',
        layout: { visibility: 'none' },
        // minzoom/maxzoomなし
        paint: {
          'line-color': '#ffffff',
          'line-width': 1,
          'line-opacity': 0.8,
        }
      })

      console.log('[N03] ✓ Municipality polygon layers added successfully')
    } else {
      console.log('[N03] Source n03-municipalities already exists')
    }

    // 福祉レイヤーがONの場合、初期表示モードに応じてvisibilityを設定
    setTimeout(() => {
      if (activeLayers.welfare && welfareDisplayMode === 'municipality') {
        if (map.getLayer('n03-municipalities-fill')) {
          map.setLayoutProperty('n03-municipalities-fill', 'visibility', 'visible')
        }
        if (map.getLayer('n03-municipalities-outline')) {
          map.setLayoutProperty('n03-municipalities-outline', 'visibility', 'visible')
        }
      }
    }, 100)
  }

  // GeolocateControlのイベントハンドラ（ボタンクリック時に地図を移動）
  const handleGeolocate = (e: any) => {
    console.log('[Geolocation] Geolocate event received:', e)

    // イベントから位置情報を取得（複数のパターンに対応）
    let latitude: number | undefined
    let longitude: number | undefined

    if (e && e.coords) {
      latitude = e.coords.latitude
      longitude = e.coords.longitude
    } else if (e && typeof e.latitude === 'number' && typeof e.longitude === 'number') {
      latitude = e.latitude
      longitude = e.longitude
    } else if (e && e.position && e.position.coords) {
      latitude = e.position.coords.latitude
      longitude = e.position.coords.longitude
    }

    if (latitude !== undefined && longitude !== undefined) {
      console.log('[Geolocation] Button clicked - moving to:', { latitude, longitude })
      setGpsPosition([latitude, longitude])
      // ボタンクリック時は地図を現在地に移動
      setViewport({
        longitude,
        latitude,
        zoom: 15,
      })
    } else {
      console.warn('[Geolocation] Could not extract position from event:', e)
    }
  }

  // 連続位置追跡（ももちゃりレイヤーON時）
  useEffect(() => {
    if (!activeLayers.momochari) {
      // ももちゃりレイヤーがOFFの場合は位置情報をクリア
      setGpsPosition(null)
      setIsFirstGpsUpdate(true)
      return
    }

    console.log('[Geolocation] Starting continuous position tracking...')

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        console.log('[Geolocation] Position updated:', { latitude, longitude })
        setGpsPosition([latitude, longitude])

        // 初回取得時のみ地図を現在地に移動
        if (isFirstGpsUpdate) {
          console.log('[Geolocation] First position update - moving map to current location')
          setViewport({
            longitude,
            latitude,
            zoom: 15,
          })
          setIsFirstGpsUpdate(false)
        }
      },
      (error) => {
        if (error.code === 1) {
          console.warn('[Geolocation] 位置情報の許可が必要です。ブラウザの設定で位置情報を許可してください。')
        } else if (error.code === 2) {
          console.warn('[Geolocation] 位置情報を取得できません。GPS信号が弱い可能性があります。')
        } else if (error.code === 3) {
          console.warn('[Geolocation] 位置情報の取得がタイムアウトしました。再試行中...')
        } else {
          console.error('[Geolocation] Error:', error.message)
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000, // タイムアウトを15秒に延長
      }
    )

    return () => {
      console.log('[Geolocation] Stopping position tracking')
      navigator.geolocation.clearWatch(watchId)
    }
  }, [activeLayers.momochari, isFirstGpsUpdate])

  // 辞書ファイルと市区町村境界の読み込み（停電/福祉レイヤー有効時）
  useEffect(() => {
    if (!activeLayers.outages && !activeLayers.welfare) {
      console.log('[Layer] Outages/Welfare layer not active, skipping boundary load')
      return
    }

    if (activeLayers.outages) {
      console.log('[Outage] Loading dictionaries and municipalities...')
      Promise.all([
        fetch('/okayama_district_dict.json').then(r => r.json()),
        fetch('/okayama_n03_dict.json').then(r => r.json()),
        fetch('/okayama_municipalities_simple.geojson').then(r => r.json())
      ]).then(([distDict, muniDict, muniGeoJSON]) => {
        setDistrictDict(distDict)
        setMunicipalityDict(muniDict)
        setMunicipalitiesGeoJSON(muniGeoJSON)
        console.log('[Outage] Dictionaries and municipalities loaded:', {
          districts: Object.keys(distDict).length,
          municipalities: Object.keys(muniDict).length,
          municipalityFeatures: muniGeoJSON.features.length
        })
      }).catch(err => {
        console.error('[Outage] Failed to load dictionaries:', err)
      })
      return
    }

    if (activeLayers.welfare && !municipalitiesGeoJSON) {
      console.log('[Welfare] Loading municipalities boundary...')
      fetch('/okayama_municipalities_simple.geojson')
        .then(r => r.json())
        .then((muniGeoJSON) => {
          setMunicipalitiesGeoJSON(muniGeoJSON)
          console.log('[Welfare] Municipalities loaded:', muniGeoJSON.features?.length || 0)
        })
        .catch(err => {
          console.error('[Welfare] Failed to load municipalities:', err)
        })
    }
  }, [activeLayers.outages, activeLayers.welfare, municipalitiesGeoJSON])

  // 停電情報の取得（定期的にポーリング）
  useEffect(() => {
    if (!activeLayers.outages) {
      setOutageData([])
      return
    }

    const fetchOutages = async () => {
      try {
        const demoParam = outageDemoMode ? '&demo=true' : ''
        const response = await fetch(`/api/outages?timeRange=${outageTimeRange}${demoParam}`)
        const data = await response.json()
        setOutageData(data)
        console.log(`[Outage] Fetched outage data (${outageTimeRange}, demo=${outageDemoMode}):`, data.length, 'items')
      } catch (err) {
        console.error('[Outage] Failed to fetch outage data:', err)
      }
    }

    fetchOutages()

    // リアルタイムの場合のみ5分ごとにポーリング
    let interval: NodeJS.Timeout | null = null
    if (outageTimeRange === 'current') {
      interval = setInterval(fetchOutages, 300000) // 5分ごと
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [activeLayers.outages, outageTimeRange, outageDemoMode])

  // 市区町村レベルの停電情報GeoJSON（低ズーム用）
  const municipalityOutageGeoJSON = useMemo(() => {
    if (!municipalitiesGeoJSON) {
      return null
    }

    if (outageData.length === 0) {
      console.log('[Outage] No outage data, returning null for municipalities')
      return null
    }

    console.log('[Outage] Applying outage data to municipalities...')

    // 停電がある市区町村名をSetに格納（正規化済み）
    const outageCities = new Set<string>()

    for (const outage of outageData) {
      // 「岡山県 岡山市北区」のような形式で正規化
      let cityPart: string

      // 郡(county) + 町/村(town/village)の場合は町村名のみ使用
      if (outage.city && outage.city.includes('郡') && outage.ward && (outage.ward.includes('町') || outage.ward.includes('村'))) {
        cityPart = outage.ward
      } else if (outage.ward) {
        // 通常の市+区の場合は連結
        cityPart = `${outage.city}${outage.ward}`
      } else {
        cityPart = outage.city || ''
      }

      const cityName = `${outage.prefecture || ''} ${cityPart}`.trim()
      outageCities.add(cityName)
      console.log('[Outage] Municipality with outage:', cityName, 'from:', outage)
    }

    // GeoJSONのfeaturesにoutageプロパティを追加
    const updatedGeoJSON = {
      type: 'FeatureCollection' as const,
      features: municipalitiesGeoJSON.features.map((feature: any) => {
        const featureName = (feature.properties.name || '').trim()
        const hasOutage = outageCities.has(featureName)

        if (hasOutage) {
          console.log('[Outage] Feature with outage:', featureName)
        }

        return {
          ...feature,
          properties: {
            ...feature.properties,
            outage: hasOutage
          }
        }
      })
    }

    const featuresWithOutage = updatedGeoJSON.features.filter((f: any) => f.properties.outage)
    // Applied outages to municipalities
    return updatedGeoJSON
  }, [municipalitiesGeoJSON, outageData])

  const welfareMunicipalityClusterGeoJSON = useMemo(() => {
    if (!welfareMunicipalityCenters.length) return null

    const features = welfareMunicipalityCenters.map((m) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: m.center },
      properties: {
        point_count: m.count,
        point_count_abbreviated: String(m.count),
        name: m.key,
      },
    }))

    return { type: 'FeatureCollection', features } as any
  }, [welfareMunicipalityCenters])

  const welfarePrefectureClusterGeoJSON = useMemo(() => {
    if (!welfarePrefectureCounts.length) return null
    return {
      type: 'FeatureCollection',
      features: welfarePrefectureCounts.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p.center },
        properties: { point_count: p.count, point_count_abbreviated: String(p.count), name: p.pref },
      })),
    } as any
  }, [welfarePrefectureCounts])


  // 地区レベルの福祉施設ヒートマップGeoJSON（高ズーム用、岡山県のみ）
  const districtWelfareGeoJSON = useMemo(() => {
    if (!districtsGeoJSON || welfareDisplayMode !== 'municipality') {
      return null
    }

    if (Object.keys(welfareDistrictCounts).length === 0) {
      return null
    }

    // 施設がある地区だけフィルタリング（最適化）
    const updatedGeoJSON = {
      type: 'FeatureCollection' as const,
      features: districtsGeoJSON.features
        .map((feature: any) => {
          const keyCode = feature.properties.key_code || feature.properties.KEY_CODE || feature.properties.AREA_ID
          const count = welfareDistrictCounts[keyCode] || 0

          // 施設が0件の地区はスキップ（軽量化）
          if (count === 0) return null

          return {
            ...feature,
            properties: {
              ...feature.properties,
              welfare_count: count
            }
          }
        })
        .filter(Boolean)  // nullを除去
    }

    console.log(`[Welfare] District heatmap: ${updatedGeoJSON.features.length} districts with facilities (filtered from ${districtsGeoJSON.features.length})`)
    return updatedGeoJSON
  }, [districtsGeoJSON, welfareDistrictCounts, welfareDisplayMode])

  // 地区レベルの停電情報GeoJSON（高ズーム用）
  const districtOutageGeoJSON = useMemo(() => {
    if (!districtsGeoJSON || !districtDict || outageData.length === 0) {
      return null
    }

    // 停電している地区のkey_codeをSetに格納
    const outageKeys = new Set<string>()

    for (const outage of outageData) {
      // districtが空の場合はスキップ（市区町村レベルのみ）
      if (!outage.district || outage.district.trim() === '') {
        continue
      }

      // 複数地区がカンマ区切りで含まれている場合は分割
      const districts = outage.district.split(',').map(d => d.trim()).filter(d => d)

      for (const district of districts) {
        const districtOutage = {
          ...outage,
          district: district
        }

        const normalizedKey = buildNormalizedKey(districtOutage)
        const districtEntry = districtDict[normalizedKey]

        if (districtEntry) {
          outageKeys.add(districtEntry.key_code)
          // Matched
        } else {
          console.warn('[Outage] Not matched:', normalizedKey)
        }
      }
    }

    // GeoJSONのfeaturesにoutageプロパティを追加
    const updatedGeoJSON = {
      type: 'FeatureCollection' as const,
      features: districtsGeoJSON.features.map((feature: any) => ({
        ...feature,
        properties: {
          ...feature.properties,
          outage: outageKeys.has(feature.properties.key_code)
        }
      }))
    }

    // Applied outages
    return updatedGeoJSON
  }, [districtsGeoJSON, districtDict, outageData])

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        {...viewport}
        onMove={(evt) => {
          if (welfareSpider) {
            setWelfareSpider(null)
          }
          setViewport(evt.viewState)
          if (onMapMove) {
            onMapMove({
              lat: evt.viewState.latitude,
              lon: evt.viewState.longitude,
              zoom: evt.viewState.zoom
            })
          }
        }}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        interactiveLayerIds={['spots-layer', 'momochari-layer', 'shelters-layer', 'landslide-fill', 'outages-district-fill', 'outages-municipality-fill', 'outages-district-label', 'welfare-district-clusters', 'welfare-points']}
        minZoom={4}
        maxZoom={17.5}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://gsi-cyberjapan.github.io/gsivectortile-mapbox-gl-js/pale.json"
      >
        {/* 傾斜レイヤー（国土地理院 色別標高図） */}
        {activeLayers.slope && (
          <>
            {console.log('[Slope Layer] Rendering GSI colored relief tiles')}
            <Source
              id="slope-source-raster"
              type="raster"
              tiles={['https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png']}
              tileSize={256}
              minzoom={5}
              maxzoom={15}
              attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院 陰影起伏図</a>'
            >
              <Layer
                id="slope-layer-raster"
                type="raster"
                paint={{
                  'raster-opacity': 0.4,
                  'raster-fade-duration': 100
                }}
              />
            </Source>
          </>
        )}

        {/* 土砂災害警戒区域レイヤー */}
        {activeLayers.landslide && (
          <>
            {console.log('[Landslide Layer] Rendering landslide layer')}
            <Source
              id="landslide-source"
              type="geojson"
              data="/okayama_landslide.geojson"
            >
              <Layer
                id="landslide-layer"
                type="fill"
                paint={{
                  'fill-color': '#f97316',
                  'fill-opacity': 0.4,
                }}
              />
              <Layer
                id="landslide-outline"
                type="line"
                paint={{
                  'line-color': '#c2410c',
                  'line-width': 1,
                }}
              />
            </Source>
          </>
        )}

        {/* 河川レイヤー */}
        {activeLayers.rivers && (
          <Source
            id="rivers-source"
            type="geojson"
            data="/okayama_rivers.geojson"
            attribution='<a href="https://nlftp.mlit.go.jp/" target="_blank">国土数値情報</a>'
          >
            <Layer
              id="rivers-layer"
              type="line"
              paint={{
                'line-color': '#3b82f6',
                'line-width': 2,
                'line-opacity': 0.7,
              }}
            />
          </Source>
        )}

        {/* 観光スポットレイヤー */}
        {activeLayers.spots && (
          <Source
            id="spots-source"
            type="geojson"
            data="/okayama_spots.geojson"
            attribution='観光スポットデータ'
          >
            <Layer
              id="spots-layer"
              type="circle"
              paint={{
                'circle-radius': 8,
                'circle-color': '#ef4444',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              }}
            />
          </Source>
        )}

        {/* ももちゃりポートレイヤー */}
        {activeLayers.momochari && momochariGeoJSON && (
          <Source
            id="momochari-source"
            type="geojson"
            data={momochariGeoJSON}
            attribution='<a href="https://www.city.okayama.jp/kurashi/0000005428.html" target="_blank">岡山市オープンデータ</a>'
          >
            <Layer
              id="momochari-layer"
              type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': '#22c55e',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              }}
            />
          </Source>
        )}

        {/* 避難所レイヤー */}
        {activeLayers.realShelters && shelters.length > 0 && (
          <Source
            id="shelters-source"
            type="geojson"
            data={{
              type: 'FeatureCollection',
              features: shelters
            }}
            attribution='<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">国土数値情報（避難施設データ）</a>'
          >
            <Layer
              id="shelters-layer"
              type="circle"
              paint={{
                'circle-radius': 7,
                'circle-color': '#3b82f6',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              }}
            />
          </Source>
        )}

        {/* 土砂災害警戒区域レイヤー */}
        {activeLayers.landslide && landslideZones.length > 0 && (
          <Source
            id="landslide-source"
            type="geojson"
            data={{
              type: 'FeatureCollection',
              features: landslideZones
            }}
            attribution='<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank">国土数値情報（土砂災害危険箇所データ）</a>'
          >
            <Layer
              id="landslide-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'match',
                  ['get', 'A43_002'],
                  '1', '#fb923c', // 警戒区域（オレンジ）
                  '2', '#dc2626', // 特別警戒区域（赤）
                  '#fb923c' // デフォルト
                ],
                'fill-opacity': hazardOpacity * 0.7,
              }}
            />
            <Layer
              id="landslide-outline"
              type="line"
              paint={{
                'line-color': [
                  'match',
                  ['get', 'A43_002'],
                  '1', '#ea580c',
                  '2', '#991b1b',
                  '#ea580c'
                ],
                'line-width': 1.5,
              }}
            />
          </Source>
        )}

        {/* 地区境界レイヤー（ズーム11+、districtsレイヤーON時のみ） */}
        {activeLayers.districts && !activeLayers.outages && districtsGeoJSON && (
          <Source
            id="districts-source"
            type="geojson"
            data={districtsGeoJSON}
            attribution='<a href="https://www.e-stat.go.jp/" target="_blank">e-Stat 町丁・字等別境界データ</a>'
          >
            <Layer
              id="districts-layer"
              type="line"
              paint={{
                'line-color': '#9ca3af',
                'line-width': 1,
                'line-opacity': boundaryOpacity * 0.7,
              }}
            />
          </Source>
        )}

        {/* 地区レベル福祉施設ヒートマップ（ズーム11+、市町村モード時、岡山県のみ） */}
        {activeLayers.welfare && welfareDisplayMode === 'municipality' && districtWelfareGeoJSON && (
          <Source
            id="district-welfare-source"
            type="geojson"
            data={districtWelfareGeoJSON}
          >
            <Layer
              id="district-welfare-fill"
              type="fill"
              minzoom={11}  // ズーム11以上で表示
              paint={{
                'fill-color': [
                  'interpolate',
                  ['linear'],
                  ['get', 'welfare_count'],
                  0, '#dbeafe',      // 0件: 薄い青
                  1, '#7dd3fc',      // 1件: 水色
                  3, '#22c55e',      // 3件: 緑
                  5, '#eab308',      // 5件: 黄色
                  10, '#f97316',     // 10件: オレンジ
                  20, '#ef4444',     // 20件: 赤
                  50, '#b91c1c'      // 50件以上: 濃い赤
                ],
                'fill-opacity': 0.7,
              }}
            />
            <Layer
              id="district-welfare-outline"
              type="line"
              minzoom={11}
              paint={{
                'line-color': '#ffffff',
                'line-width': 0.5,
                'line-opacity': 0.8,
              }}
            />
          </Source>
        )}

        {/* 県クラスタ（z<=8.7） */}
        {activeLayers.welfare && welfareDisplayMode === 'cluster' && welfarePrefectureClusterGeoJSON && (
          <Source id="welfare-pref-source" type="geojson" data={welfarePrefectureClusterGeoJSON}>
            <Layer
              id="welfare-pref-cluster"
              type="circle"
              paint={{
                'circle-radius': [
                  'interpolate',
                  ['exponential', 1.6],
                  ['get', 'point_count'],
                  300, 30,     // 300件
                  1000, 50,    // 1,000件
                  2000, 80,    // 2,000件
                  3000, 110    // 3,000件
                ],
                'circle-color': [
                  'interpolate',
                  ['linear'],
                  ['get', 'point_count'],
                  500, '#dbeafe',    // 500件: 薄い青
                  1000, '#7dd3fc',   // 1,000件: 水色
                  1500, '#22c55e',   // 1,500件: 緑
                  2000, '#eab308',   // 2,000件: 黄
                  2500, '#f97316',   // 2,500件: オレンジ
                  3000, '#ef4444'    // 3,000件: 赤
                ],
                'circle-opacity': 0.42,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              }}
              minzoom={0}
              maxzoom={8.7}
            />
            <Layer
              id="welfare-pref-count"
              type="symbol"
              layout={{
                'text-field': '{point_count_abbreviated}',
                'text-size': 16,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              }}
              paint={{ 'text-color': '#0f172a' }}
              minzoom={0}
              maxzoom={8.7}
            />
          </Source>
        )}

        {/* 市町村クラスタ（8.7<z<11） */}
        {activeLayers.welfare && welfareDisplayMode === 'cluster' && welfareMunicipalityClusterGeoJSON && (
          <Source id="welfare-muni-source" type="geojson" data={welfareMunicipalityClusterGeoJSON}>
            <Layer
              id="welfare-muni-clusters"
              type="circle"
              paint={{
                'circle-radius': [
                  'interpolate',
                  ['exponential', 1.5],
                  ['get', 'point_count'],
                  1, 8,        // 1件: 8px
                  10, 15,      // 10件: 15px
                  50, 25,      // 50件: 25px
                  100, 35,     // 100件: 35px
                  200, 50,     // 200件: 50px
                  500, 70      // 500件: 70px
                ],
                'circle-color': [
                  'interpolate',
                  ['linear'],
                  ['get', 'point_count'],
                  1, '#dbeafe',     // 1件: 薄い青
                  20, '#7dd3fc',    // 20件: 水色
                  50, '#22c55e',    // 50件: 緑
                  100, '#eab308',   // 100件: 黄
                  200, '#f97316',   // 200件: オレンジ
                  500, '#ef4444'    // 500件: 赤
                ],
                'circle-opacity': 0.6,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              }}
              minzoom={8.7}
              maxzoom={11}
            />
            <Layer
              id="welfare-muni-count"
              type="symbol"
              layout={{
                'text-field': '{point_count_abbreviated}',
                'text-size': 12,
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              }}
              paint={{ 'text-color': '#0f172a' }}
              minzoom={8.7}
              maxzoom={11}
            />
          </Source>
        )}

        {/* 福祉施設市町村コロプレス - N03 PMTilesのfillレイヤーを使用 */}

        {/* 福祉施設3Dメッシュ（z>=10） */}
        {activeLayers.welfare && welfareDisplayMode === '3d' && welfareMeshGeoJSON && (
          <Source id="welfare-mesh-source" type="geojson" data={welfareMeshGeoJSON}>
            <Layer
              id="welfare-3d"
              type="fill-extrusion"
              paint={{
                // メッシュの塗りつぶし色（施設数に応じたグラデーション、鮮やかな配色）
                'fill-extrusion-color': [
                  'interpolate',
                  ['linear'],
                  ['get', 'count'],
                  1, '#3b82f6',      // 1-5件: 青（鮮やか）
                  5, '#10b981',      // 5-10件: 緑
                  10, '#eab308',     // 10-20件: 黄色
                  20, '#f97316',     // 20-30件: オレンジ
                  30, '#ef4444',     // 30-50件: 赤
                  50, '#b91c1c'      // 50件以上: 濃い赤
                ],
                // 3Dの高さ（heightプロパティを使用、施設数 × 100m）
                'fill-extrusion-height': ['get', 'height'],
                // ベースの高さ（地面）
                'fill-extrusion-base': 0,
                // 不透明度（やや透明にして重なりが見えるように）
                'fill-extrusion-opacity': 0.85,
              }}
              minzoom={10}  // ズーム10以上で表示
            />
          </Source>
        )}

        {/* 停電レイヤー（市区町村レベル：zoom 11未満で表示） */}
        {(() => {
          // Simple condition: show only when zoom < 11
          const shouldShow = activeLayers.outages && municipalityOutageGeoJSON && outageData.length > 0 && viewport.zoom < 11
          console.log('[Outage Render] Municipality check:', {
            zoom: viewport.zoom,
            shouldShow,
            zoomCheck: viewport.zoom < 11,
            hasGeoJSON: !!municipalityOutageGeoJSON,
            outageDataLength: outageData.length,
            municipalityFeaturesWithOutage: municipalityOutageGeoJSON?.features?.filter((f: any) => f.properties.outage).length || 0
          })
          return shouldShow
        })() && (
          <Source
            id="outages-municipality-source"
            type="geojson"
            data={municipalityOutageGeoJSON!}
            attribution='停電情報レイヤー（市区町村）'
          >
            <Layer
              id="outages-municipality-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'case',
                  ['get', 'outage'],
                  '#ef4444',
                  'transparent'
                ],
                'fill-opacity': 0.5
              }}
              minzoom={8}
              maxzoom={11}
            />
            <Layer
              id="outages-municipality-outline"
              type="line"
              paint={{
                'line-color': [
                  'case',
                  ['get', 'outage'],
                  '#b91c1c',
                  'transparent'
                ],
                'line-width': 2
              }}
              minzoom={8}
              maxzoom={11}
            />
          </Source>
        )}

        {/* 停電レイヤー（地区レベル：ズーム11以上かつデータロード済み） */}
        {(() => {
          const hasDistrictGeoJSON = districtOutageGeoJSON && districtOutageGeoJSON.features && districtOutageGeoJSON.features.length > 0
          const shouldShow = activeLayers.outages && hasDistrictGeoJSON && viewport.zoom >= 11
          const outageCount = districtOutageGeoJSON?.features?.filter((f: any) => f.properties.outage).length || 0
          console.log('[Outage Render] District check:', {
            zoom: viewport.zoom,
            shouldShow,
            zoomCheck: viewport.zoom >= 11,
            hasDistrictGeoJSON,
            totalFeatures: districtOutageGeoJSON?.features?.length || 0,
            outageFeatures: outageCount,
            districtsLoading,
            outageDataLength: outageData.length
          })
          return shouldShow && districtOutageGeoJSON
        })() && districtOutageGeoJSON && (
          <Source
            id="outages-district-source"
            type="geojson"
            data={districtOutageGeoJSON}
            attribution='停電情報レイヤー（地区）'
          >
            <Layer
              id="outages-district-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'case',
                  ['get', 'outage'],
                  '#ef4444',
                  'transparent'
                ],
                'fill-opacity': 0.6,
              }}
              minzoom={11}
              maxzoom={22}
            />
            <Layer
              id="outages-district-outline"
              type="line"
              paint={{
                'line-color': [
                  'case',
                  ['get', 'outage'],
                  '#b91c1c',
                  'transparent'
                ],
                'line-width': 2,
              }}
              minzoom={11}
              maxzoom={22}
            />
            <Layer
              id="outages-district-label"
              type="symbol"
              filter={['get', 'outage']}
              layout={{
                'text-field': '⚡',
                'text-size': 20,
                'text-allow-overlap': true,
                'text-ignore-placement': false,
              }}
              paint={{
                'text-color': '#991b1b',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2,
              }}
              minzoom={12}
              maxzoom={22}
            />
          </Source>
        )}

        <NavigationControl position="top-right" />
        <GeolocateControl
          position="top-right"
          onGeolocate={handleGeolocate}
          trackUserLocation={false}
          showUserLocation={false}
          showAccuracyCircle={false}
        />
        <ScaleControl position="bottom-right" />

        {/* 福祉施設のspiderfy展開ライン */}
        {welfareSpiderLegs && (
          <Source id="welfare-spider-legs" type="geojson" data={welfareSpiderLegs}>
            <Layer
              id="welfare-spider-legs-layer"
              type="line"
              paint={{
                'line-color': '#4b5563',
                'line-width': 1.5,
                'line-opacity': 0.8,
              }}
            />
          </Source>
        )}

        {/* 現在地マーカー（パルスアニメーション付き） */}
        {gpsPosition && (
          <Marker
            longitude={gpsPosition[1]}
            latitude={gpsPosition[0]}
            anchor="center"
          >
            <div style={{ position: 'relative', width: '20px', height: '20px' }}>
              {/* パルスエフェクト */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: 'rgba(66, 133, 244, 0.3)',
                animation: 'gps-pulse 2s infinite',
              }} />
              {/* 中心の点 */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#4285F4',
                border: '2px solid white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }} />
            </div>
          </Marker>
        )}

        {/* 検索ハイライトマーカー */}
        {searchHighlight && (
          <Marker
            longitude={searchHighlight.lon}
            latitude={searchHighlight.lat}
          >
            <div className="relative">
              <div className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-yellow-400 rounded-full animate-ping opacity-75"></div>
              <div className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-yellow-500 rounded-full border-2 border-white"></div>
            </div>
          </Marker>
        )}

        {/* アラートピン */}
        {alertPin && (
          <Marker
            longitude={alertPin.lon}
            latitude={alertPin.lat}
          >
            <div className="relative">
              <div className="absolute -translate-x-1/2 -translate-y-full mb-2">
                <div className="bg-red-600 text-white px-3 py-2 rounded-lg shadow-lg text-xs font-semibold whitespace-nowrap">
                  📢 {alertPin.alert.title}
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-600"></div>
              </div>
              <div className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-red-500 rounded-full animate-ping opacity-75"></div>
              <div className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-red-600 rounded-full border-2 border-white flex items-center justify-center text-white text-xs">
                ⚠️
              </div>
            </div>
          </Marker>
        )}

        {/* 福祉施設のspiderfy展開ノード */}
        {welfareSpider?.nodes.map((node) => {
          const facilityColor = getFacilityTypeColor(node.properties.P14_004 || 0)
          return (
            <Marker
              key={node.id}
              longitude={node.expanded[0]}
              latitude={node.expanded[1]}
              anchor="center"
            >
              <button
                type="button"
                onClick={(evt) => {
                  evt.stopPropagation()
                  openWelfarePopup(node.properties, node.original)
                }}
                className="w-4 h-4 rounded-full border-[2.5px] border-white shadow-md"
                style={{ backgroundColor: facilityColor }}
                title={node.properties.P14_007 || '福祉施設'}
              />
            </Marker>
          )
        })}
      </Map>

      {/* パルスアニメーション用のスタイル */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes gps-pulse {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(3);
            opacity: 0;
          }
        }
      `}} />

      {/* 情報パネル - サイドバーの隣に表示 */}
      {popupInfo && (
        <aside
          className="w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            position: 'absolute',
            top: '1rem',
            left: showSidebar ? '16px' : '80px',
          }}
        >
          {/* ヘッダー */}
          <div className={`px-5 py-4 ${popupInfo.type === 'outage' ? 'bg-gradient-to-r from-red-600 to-red-700' : 'bg-gradient-to-r from-blue-600 to-blue-700'}`}>
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-bold text-white pr-2">
                {popupInfo.name}
              </h2>
              <button
                onClick={() => setPopupInfo(null)}
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
          <div className="p-5 space-y-4">
            {/* 種別バッジ */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                popupInfo.type === 'outage' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {popupInfo.type === 'castle' ? '🏯 城郭' :
                 popupInfo.type === 'garden' ? '🌳 庭園' :
                 popupInfo.type === 'tourist' ? '🗺️ 観光地' :
                 popupInfo.type === 'shrine' ? '⛩️ 神社' :
                 popupInfo.type === 'bridge' ? '🌉 橋梁' :
                 popupInfo.type === 'momochari' ? '🚲 ももちゃり' :
                 popupInfo.type === 'outage' ? '⚡ 停電情報' : '📍 スポット'}
              </span>
            </div>

            {/* 停電情報の詳細 */}
            {popupInfo.type === 'outage' && popupInfo.outageInfo && (
              <div className="space-y-3">
                {/* ステータス */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold ${
                      popupInfo.outageInfo.status === 'ongoing' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
                    }`}>
                      {popupInfo.outageInfo.status === 'ongoing' ? '停電中' : '復旧済み'}
                    </span>
                    <span className="text-xs text-red-700">
                      {new Date(popupInfo.outageInfo.timestamp).toLocaleString('ja-JP', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })} 発生
                    </span>
                  </div>
                </div>

                {/* 原因 */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    停電原因
                  </h3>
                  <p className="text-sm text-gray-900 font-medium">
                    {popupInfo.outageInfo.cause}
                  </p>
                </div>

                {/* 停電戸数 */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    影響戸数
                  </h3>
                  <p className="text-2xl font-bold text-red-600">
                    約 {popupInfo.outageInfo.households.toLocaleString()} 戸
                  </p>
                </div>

                {/* 復旧時刻 */}
                {popupInfo.outageInfo.recovered_at && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      復旧時刻
                    </h3>
                    <p className="text-sm text-green-700 font-medium">
                      {new Date(popupInfo.outageInfo.recovered_at).toLocaleString('ja-JP', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                )}

                {/* 公式情報へのリンク */}
                <a
                  href="https://www.teideninfo.energia.co.jp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-red-600 hover:bg-red-700 text-white text-center font-medium py-2.5 px-4 rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>最新情報を公式サイトで確認</span>
                  </div>
                </a>
              </div>
            )}

            {/* 通常の説明（停電以外） */}
            {popupInfo.type !== 'outage' && popupInfo.description && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  詳細情報
                </h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {popupInfo.description}
                </p>
              </div>
            )}

            {/* 座標情報（停電以外） */}
            {popupInfo.type !== 'outage' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">緯度</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {popupInfo.latitude.toFixed(5)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">経度</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {popupInfo.longitude.toFixed(5)}
                  </div>
                </div>
              </div>
            )}

            {/* Google Maps で開く（停電以外） */}
            {popupInfo.type !== 'outage' && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${popupInfo.latitude},${popupInfo.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-green-600 hover:bg-green-700 text-white text-center font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  <span>Googleマップで開く</span>
                </div>
              </a>
            )}

            {/* Wikipedia/公式サイト リンク（停電以外） */}
            {popupInfo.type !== 'outage' && popupInfo.url && popupInfo.url !== '#' && (
              <a
                href={popupInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-gray-700 hover:bg-gray-800 text-white text-center font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.231-.177-.242-.481-.525-.878-.807l-.619-.43V3h6.818v.974l-1.008.07c-.493.032-.782.212-.782.461 0 .126.109.4.246.738.688 1.737 2.065 4.956 2.891 6.859l2.301-4.948c.369-.772.525-1.25.525-1.566 0-.314-.217-.573-.648-.778l-.813-.43V3h4.88v.974l-.738.072c-.328.033-.633.184-.904.45-.271.265-.507.629-.709 1.089l-3.871 8.534zm4.181-6.827l-1.195 2.578 3.825 8.313c.211.456.439.862.684 1.213.244.35.549.65.915.899l.586.399V21h-6.818v-.974l.814-.072c.404-.032.686-.212.686-.461 0-.126-.109-.4-.246-.738l-1.275-2.774-2.104-4.538-1.057 2.274c-.369.772-.525 1.25-.525 1.566 0 .314.217.573.648.778l.813.43V21H6.818v-.974l.738-.072c.328-.033.633-.184.904-.45.271-.265.507-.629.709-1.089l3.871-8.534.916-1.976z"/>
                  </svg>
                  <span>{popupInfo.type === 'momochari' ? '公式サイトで詳細を見る' : 'Wikipediaで詳細を見る'}</span>
                </div>
              </a>
            )}
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-5 py-3 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              ピンをクリックしてスポット情報を確認
            </p>
          </div>
        </aside>
      )}

      {/* リスクカード */}
      <RiskCard
        riskInfo={riskInfo}
        onClose={() => setRiskInfo(null)}
      />

      {/* 近くのももちゃりポートパネル */}
      {activeLayers.momochari && momochariBikes.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '5rem',
            right: '1rem',
            maxWidth: '320px',
            zIndex: 10,
          }}
        >
          <NearbyPortsPanel
            bikes={momochariBikes}
            gpsPosition={gpsPosition}
            visitedCount={0}
            totalCount={momochariBikes.length}
            onPortClick={handlePortClick}
          />
        </div>
      )}

      {/* 凡例 */}
      <Legend
        activeLayers={activeLayers}
        zoom={viewport.zoom}
        welfareDisplayMode={welfareDisplayMode}
        onWelfareDisplayModeChange={setWelfareDisplayMode}
      />

      {/* デバッグパネル */}
      <DebugPanel stats={debugStats} visible={true} />

      {/* 速報タイムライン */}
      <AlertTimeline onAlertSelect={handleAlertSelect} />

      {/* データクレジット表示 */}
      <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-2 items-end pointer-events-none">
        {activeLayers.outages && (
          <CreditBadge
            label="停電情報: 中国電力ネットワーク株式会社"
            href="https://www.teideninfo.energia.co.jp/"
          />
        )}
      </div>
    </div>
  )
}
