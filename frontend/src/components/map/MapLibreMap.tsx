'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import Map, { NavigationControl, GeolocateControl, ScaleControl, Layer, Source, Marker, Popup } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import NearbyPortsPanel from './NearbyPortsPanel'
import CreditBadge from './CreditBadge'
import { useDistrictLayers } from '@/hooks/useDistrictLayers'
import { buildNormalizedKey, type OutageInfo, type DistrictDict, type MunicipalityDict } from '@/lib/outageMapper'

interface MapLibreMapProps {
  activeLayers: Record<string, boolean>
  showSidebar: boolean
  outageTimeRange?: string
  outageDemoMode?: boolean
}

type PopupInfo = {
  longitude: number
  latitude: number
  name: string
  description?: string
  url?: string
  type?: string
}

export default function MapLibreMap({
  activeLayers,
  showSidebar,
  outageTimeRange = 'current',
  outageDemoMode = false
}: MapLibreMapProps) {
  const mapRef = useRef<any>(null)
  const [viewport, setViewport] = useState({
    longitude: 133.93,
    latitude: 34.66,
    zoom: 11,
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

  // 地区境界の遅延ロード（ズーム11+で表示）
  const {
    geojson: districtsGeoJSON,
    loading: districtsLoading,
    error: districtsError,
    featureCount
  } = useDistrictLayers(
    viewport.zoom,
    activeLayers.districts || activeLayers.outages
  )

  // districtsGeoJSONの変化を追跡
  useEffect(() => {
    console.log('[Outage] districtsGeoJSON changed:', {
      hasDistrictsGeoJSON: !!districtsGeoJSON,
      featureCount: districtsGeoJSON?.features?.length || 0,
      loading: districtsLoading,
      error: districtsError
    })
  }, [districtsGeoJSON, districtsLoading, districtsError])

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
    if (!features || features.length === 0) return

    console.log('Clicked features:', features.map((f: any) => ({ id: f.layer.id, props: f.properties })))

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
  }

  // マウス移動時のカーソル変更
  const handleMouseMove = (e: any) => {
    const map = mapRef.current?.getMap()
    if (!map) return

    const features = e.features
    if (features && features.length > 0) {
      const hasClickableFeature = features.some((f: any) =>
        f.layer.id === 'spots-layer' || f.layer.id === 'momochari-layer'
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

  // マップのロード完了時
  const handleMapLoad = () => {
    const map = mapRef.current?.getMap()
    if (!map) return
    console.log('[Map] Map loaded, overzoom enabled')
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

  // 辞書ファイルと市区町村境界の読み込み（停電レイヤー有効時）
  useEffect(() => {
    if (!activeLayers.outages) {
      console.log('[Outage] Outages layer not active, skipping dictionary load')
      return
    }

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
  }, [activeLayers.outages])

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
    if (!municipalitiesGeoJSON || outageData.length === 0) {
      return municipalitiesGeoJSON
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
    console.log('[Outage] Applied outages to', outageCities.size, 'municipalities,', featuresWithOutage.length, 'features marked')
    console.log('[Outage] Outage cities Set:', Array.from(outageCities))
    return updatedGeoJSON
  }, [municipalitiesGeoJSON, outageData])

  // 地区レベルの停電情報GeoJSON（高ズーム用）
  const districtOutageGeoJSON = useMemo(() => {
    console.log('[Outage] District useMemo called:', {
      hasDistrictsGeoJSON: !!districtsGeoJSON,
      hasDistrictDict: !!districtDict,
      outageDataLength: outageData.length,
      districtsFeatures: districtsGeoJSON?.features?.length || 0
    })

    if (!districtsGeoJSON || !districtDict || outageData.length === 0) {
      return districtsGeoJSON
    }

    console.log('[Outage] Applying outage data to districts...')

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
          console.log('[Outage] Matched:', normalizedKey, '→', districtEntry.key_code)
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

    console.log('[Outage] Applied outages to', outageKeys.size, 'districts')
    return updatedGeoJSON
  }, [districtsGeoJSON, districtDict, outageData])

  // 傾斜レイヤーをMapLibre APIで直接追加（PNG画像版）
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !map.isStyleLoaded()) return

    if (activeLayers.slope) {
      console.log('[Slope Layer] Adding slope source and layer via MapLibre API (PNG)')

      // 既存のレイヤーとソースを削除
      if (map.getLayer('slope-layer')) {
        map.removeLayer('slope-layer')
      }
      if (map.getSource('slope-source')) {
        map.removeSource('slope-source')
      }

      // ソースを追加
      map.addSource('slope-source', {
        type: 'image',
        url: '/map/layers/slope_okayama_3857.png',
        coordinates: [
          [133.56860, 34.86095], // top-left
          [133.98691, 34.86095], // top-right
          [133.98691, 34.35036], // bottom-right
          [133.56860, 34.35036], // bottom-left
        ]
      })

      // レイヤーを追加
      map.addLayer({
        id: 'slope-layer',
        type: 'raster',
        source: 'slope-source',
        paint: {
          'raster-opacity': 0.6
        }
      })

      console.log('[Slope Layer] Slope layer added successfully')
    } else {
      // レイヤーをOFFにする
      if (map.getLayer('slope-layer')) {
        console.log('[Slope Layer] Removing slope layer')
        map.removeLayer('slope-layer')
      }
      if (map.getSource('slope-source')) {
        map.removeSource('slope-source')
      }
    }
  }, [activeLayers.slope])

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        {...viewport}
        onMove={(evt) => setViewport(evt.viewState)}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        interactiveLayerIds={['spots-layer', 'momochari-layer']}
        minZoom={8}
        maxZoom={17.5}
        style={{ width: '100%', height: '100%' }}
        mapStyle="https://gsi-cyberjapan.github.io/gsivectortile-mapbox-gl-js/pale.json"
      >
        {/* 傾斜レイヤー（GeoJSON版 - コメントアウト） */}
        {/*
        {activeLayers.slope && (
          <>
            {console.log('[Slope Layer] Rendering GeoJSON slope layer (4661 features, 2MB)')}
            <Source
              id="slope-source-geojson"
              type="geojson"
              data="/okayama_slope_filtered.geojson"
            >
              <Layer
                id="slope-layer-geojson"
                type="fill"
                paint={{
                  'fill-color': [
                    'match',
                    ['get', 'G04b_003'],
                    '1', '#ffffcc', // 0-5度 - 薄黄色
                    '2', '#fed976', // 5-10度 - 濃い黄色
                    '3', '#feb24c', // 10-15度 - オレンジ
                    '5', '#fc4e2a', // 20-25度 - 赤オレンジ
                    '#cccccc'       // その他 - グレー
                  ],
                  'fill-opacity': 0.6
                }}
              />
            </Source>
          </>
        )}
        */}

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

        {/* 地区境界レイヤー（ズーム11+） */}
        {activeLayers.districts && districtsGeoJSON && (
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
                'line-opacity': 0.5,
              }}
            />
          </Source>
        )}

        {/* 停電レイヤー（市区町村レベル：ズーム10以下） */}
        {(() => {
          const shouldShow = activeLayers.outages && municipalityOutageGeoJSON && viewport.zoom < 11 && outageData.length > 0
          if (activeLayers.outages) {
            console.log('[Outage Render] Municipality layer:', {
              zoom: viewport.zoom,
              shouldShow,
              hasGeoJSON: !!municipalityOutageGeoJSON,
              outageDataLength: outageData.length
            })
          }
          return shouldShow
        })() && (
          <Source
            id="outages-municipality-source"
            type="geojson"
            data={municipalityOutageGeoJSON}
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
                'fill-opacity': 0.5,
              }}
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
                'line-width': 2,
              }}
            />
          </Source>
        )}

        {/* 停電レイヤー（地区レベル：ズーム11+） */}
        {(() => {
          const shouldShow = activeLayers.outages && districtOutageGeoJSON && viewport.zoom >= 11 && outageData.length > 0
          if (activeLayers.outages && viewport.zoom >= 11) {
            console.log('[Outage Render] District layer:', {
              zoom: viewport.zoom,
              shouldShow,
              hasDistrictGeoJSON: !!districtOutageGeoJSON,
              outageDataLength: outageData.length,
              hasDistrictsGeoJSON: !!districtsGeoJSON,
              districtGeoJSONFeatures: districtOutageGeoJSON?.features?.length || 0
            })
          }
          return shouldShow
        })() && (
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
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
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
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {popupInfo.type === 'castle' ? '🏯 城郭' :
                 popupInfo.type === 'garden' ? '🌳 庭園' :
                 popupInfo.type === 'tourist' ? '🗺️ 観光地' :
                 popupInfo.type === 'shrine' ? '⛩️ 神社' :
                 popupInfo.type === 'bridge' ? '🌉 橋梁' :
                 popupInfo.type === 'momochari' ? '🚲 ももちゃり' : '📍 スポット'}
              </span>
            </div>

            {/* 説明 */}
            {popupInfo.description && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  詳細情報
                </h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {popupInfo.description}
                </p>
              </div>
            )}

            {/* 座標情報 */}
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

            {/* Google Maps で開く */}
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

            {/* Wikipedia/公式サイト リンク */}
            {popupInfo.url && popupInfo.url !== '#' && (
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
