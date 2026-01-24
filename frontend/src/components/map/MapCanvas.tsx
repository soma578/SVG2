'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import type { Shelter } from '@/types'
import { loadShelters } from '@/lib/shelterLoader'
import { getLayerProfile } from '@/lib/layerProfiles'
import { tileBaseUrl } from '@/lib/config'
import CreditBadge from '@/components/map/CreditBadge'
import { type MapMode, mapModes } from '@/lib/modes'
import NearbyPortsPanel from '@/components/map/NearbyPortsPanel'

const DEFAULT_BIKE_CREDIT =
  process.env.NEXT_PUBLIC_BIKE_CREDIT ||
  '岡山市オープンデータ「岡山市公共施設マップ_コミュニティサイクル（ももちゃり）」'

interface MapCanvasProps {
  activeLayers: Record<string, boolean>
  onShelterClick?: (shelterData: Shelter) => void
  currentMode?: MapMode
}

const TILE_SIZE = 256
const MIN_ZOOM = 6
// GSI tiles are安定している範囲に抑える
const MAX_ZOOM = 16
const INITIAL_CENTER: [number, number] = [34.665, 133.933]
const MAX_LAT = 85.05112878
const MERCATOR_RADIUS = 6378137
const MERCATOR_ORIGIN = Math.PI * MERCATOR_RADIUS
const SLOPE_MERCATOR_BOUNDS = {
  minX: 14868788.53797044,
  maxX: 14915353.480969265,
  minY: 4075895.8560763993,
  maxY: 4144953.3403218044,
}

type ScreenPoint = { x: number, y: number }
type ProjectPoint = (lat: number, lon: number) => ScreenPoint | null
type TooltipInfo = { label: string, x: number, y: number }
type Bike = { id: string, lat: number, lon: number, status?: string, floodRank?: number }
type RainTarget = { baseTime: string, validTime: string }

const weatherData = [
  { name: '岡山駅', lat: 34.6667, lon: 133.915, temp: '7.9°C', condition: '快晴', wind: '2.2m/s' },
  { name: '倉敷駅', lat: 34.5967, lon: 133.7694, temp: '7.6°C', condition: '快晴', wind: '4.1m/s' },
  { name: '津山駅', lat: 35.0694, lon: 134.0033, temp: '5.2°C', condition: '快晴', wind: '4.7m/s' },
]

const markerIconMap: Record<string, string> = {
  castle: '/tutorials/tutorial1/img/mappin1.png',
  garden: '/tutorials/tutorial1/img/mappin2.png',
  tourist: '/tutorials/tutorial1/img/mappin3.png',
  shrine: '/tutorials/tutorial1/img/mappin4.png',
  bridge: '/tutorials/tutorial1/img/mappin5.png',
}

const layerPinIcons: Record<string, string> = {
  realShelters: '/tutorials/tutorial1/img/mappin1.png',
}

const getFeatureLabel = (props: Record<string, unknown> | null | undefined, keys: string[], fallback: string) => {
  if (!props) return fallback
  const record = props as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return fallback
}

const buildNowcastTileUrl = (target: RainTarget, zoomLevel: number, x: number, y: number) =>
  `https://www.jma.go.jp/bosai/nowc/data/nowc/${target.baseTime}/none/${target.validTime}/surf/hrpns/${zoomLevel}/${x}/${y}.png`

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

const clampLat = (lat: number) => Math.min(MAX_LAT, Math.max(-MAX_LAT, lat))

const projectLatLonToWorld = (lat: number, lon: number, zoom: number) => {
  const scale = TILE_SIZE * Math.pow(2, zoom)
  const clampedLat = clampLat(lat)
  const x = ((lon + 180) / 360) * scale
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  return { x, y }
}

const projectMercatorToWorld = (x: number, y: number, zoom: number) => {
  const scale = TILE_SIZE * Math.pow(2, zoom)
  return {
    x: ((x + MERCATOR_ORIGIN) / (2 * MERCATOR_ORIGIN)) * scale,
    y: ((MERCATOR_ORIGIN - y) / (2 * MERCATOR_ORIGIN)) * scale,
  }
}
const unprojectWorldToLatLon = (x: number, y: number, zoom: number): [number, number] => {
  const scale = TILE_SIZE * Math.pow(2, zoom)
  const lon = (x / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / scale
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n))
  return [lat, lon]
}

const wrapTileIndex = (value: number, maxTiles: number) => {
  if (maxTiles <= 0) return value
  return ((value % maxTiles) + maxTiles) % maxTiles
}

const formatNumber = (value: number) => Number(value.toFixed(2))
const formatPixel = (value: number) => Math.round(value)

const simplifyRing = (ring: Position[], step: number) => {
  if (step <= 1) return ring
  const simplified: Position[] = []
  for (let i = 0; i < ring.length; i += step) {
    simplified.push(ring[i])
  }
  const last = ring[ring.length - 1]
  if (simplified[simplified.length - 1] !== last) {
    simplified.push(last)
  }
  return simplified
}

const polygonToWorldPath = (rings: Position[][], zoomLevel: number, simplifyStep = 1) => {
  const path: string[] = []
  rings.forEach((ring) => {
    const commands: string[] = []
    const processedRing = simplifyRing(ring, simplifyStep)
    processedRing.forEach((coord, index) => {
      const lon = coord[0]
      const lat = coord[1]
      const world = projectLatLonToWorld(lat, lon, zoomLevel)
      commands.push(`${index === 0 ? 'M' : 'L'}${formatPixel(world.x)} ${formatPixel(world.y)}`)
    })
    if (commands.length > 0) {
      commands.push('Z')
      path.push(...commands)
    }
  })
  return path.length ? path.join(' ') : null
}

const lineToWorldPath = (line: Position[], zoomLevel: number, simplifyStep = 1) => {
  const commands: string[] = []
  const processedLine = simplifyRing(line, simplifyStep)
  processedLine.forEach((coord, index) => {
    const lon = coord[0]
    const lat = coord[1]
    const world = projectLatLonToWorld(lat, lon, zoomLevel)
    commands.push(`${index === 0 ? 'M' : 'L'}${formatPixel(world.x)} ${formatPixel(world.y)}`)
  })
  return commands.length > 1 ? commands.join(' ') : null
}

const geometryPoints = (geometry: Geometry | null, projectPoint: ProjectPoint): ScreenPoint[] => {
  if (!geometry) return []
  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates as Position
    const projected = projectPoint(lat, lon)
    return projected ? [projected] : []
  }
  if (geometry.type === 'MultiPoint') {
    return geometry.coordinates.reduce<ScreenPoint[]>((acc, coord) => {
      const projected = projectPoint(coord[1], coord[0])
      if (projected) acc.push(projected)
      return acc
    }, [])
  }
  return []
}

function useContainerSize<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        const { width, height } = entry.contentRect
        setSize({ width, height })
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return { ref: setNode, size }
}

function MapControls({ onZoomIn, onZoomOut, onLocate }: { onZoomIn: () => void, onZoomOut: () => void, onLocate: () => void }) {
  return (
    <div className="absolute left-4 bottom-4 flex flex-col gap-2 z-20">
      <button
        onClick={onZoomIn}
        className="bg-white hover:bg-gray-100 shadow-lg rounded-lg p-2 transition-colors"
        title="ズームイン"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </button>
      <button
        onClick={onZoomOut}
        className="bg-white hover:bg-gray-100 shadow-lg rounded-lg p-2 transition-colors"
        title="ズームアウト"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>
      <button
        onClick={onLocate}
        className="bg-white hover:bg-gray-100 shadow-lg rounded-lg p-2 transition-colors"
        title="現在地"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  )
}

const WeatherBadge = ({ label, temp, wind }: { label: string, temp: string, wind: string }) => (
  <div className="bg-white/90 border border-slate-300 rounded-lg px-3 py-2 shadow-sm text-xs text-slate-700 min-w-[120px]">
    <div className="font-semibold text-slate-900 text-sm">{temp}</div>
    <div className="text-[11px]">{label} / 風 {wind}</div>
  </div>
)

export default function MapCanvas({ activeLayers, onShelterClick, currentMode = 'normal' }: MapCanvasProps) {
  const [shelters, setShelters] = useState<Shelter[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER)
  const [zoom, setZoom] = useState(11)
  const [gpsPosition, setGpsPosition] = useState<[number, number] | null>(null)
  const [visitedBikeIds, setVisitedBikeIds] = useState<string[]>([])

  const [landslideData, setLandslideData] = useState<FeatureCollection | null>(null)
  const [shelterGeoData, setShelterGeoData] = useState<FeatureCollection | null>(null)
  const [riversData, setRiversData] = useState<FeatureCollection | null>(null)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const [bikes, setBikes] = useState<Bike[]>([])
  const [bikeCredit, setBikeCredit] = useState<string | null>(DEFAULT_BIKE_CREDIT)
  const [rainTarget, setRainTarget] = useState<RainTarget | null>(null)
  const displayZoom = Math.round(zoom)

  const pointerState = useRef<{ pointerId: number, startX: number, startY: number, originCenter: [number, number] } | null>(null)
  const { ref: setContainerRef, size } = useContainerSize<HTMLDivElement>()

  useEffect(() => {
    try {
      const raw = localStorage.getItem('momochariVisitedV1')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setVisitedBikeIds(parsed.filter((v) => typeof v === 'string') as string[])
      }
    } catch (err) {
      console.warn('Failed to load visited momochari ports:', err)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('momochariVisitedV1', JSON.stringify(visitedBikeIds))
    } catch (err) {
      console.warn('Failed to persist visited momochari ports:', err)
    }
  }, [visitedBikeIds])

  const isLayerVisible = useCallback((layerId: string) => {
    const profile = getLayerProfile(layerId)
    if (profile?.minZoom !== undefined && zoom < profile.minZoom) return false
    if (profile?.maxZoom !== undefined && zoom > profile.maxZoom) return false
    return activeLayers[layerId]
  }, [activeLayers, zoom])

  const getSimplifyStepForLayer = useCallback((layerId: string) => {
    const profile = getLayerProfile(layerId)
    if (!profile?.simplify) return 1
    return zoom < profile.simplify.zoomThreshold ? Math.max(1, profile.simplify.coarseStep) : 1
  }, [zoom])

  useEffect(() => {
    loadShelters()
      .then((data) => {
        setShelters(data)
      })
      .catch((err) => {
        console.error('Failed to load shelters:', err)
      })
      .finally(() => setMapReady(true))
  }, [])

  useEffect(() => {
    fetch('/okayama_landslide.geojson')
      .then(res => res.json())
      .then((data: FeatureCollection) => setLandslideData(data))
      .catch(err => console.error('Failed to load landslide data:', err))

    fetch('/okayama_shelters.geojson')
      .then(res => res.json())
      .then((data: FeatureCollection) => setShelterGeoData(data))
      .catch(err => console.error('Failed to load shelter data:', err))

    fetch('/okayama_rivers.geojson')
      .then(res => res.json())
      .then((data: FeatureCollection) => setRiversData(data))
      .catch(err => console.error('Failed to load river data:', err))
  }, [])

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null
    const visible = isLayerVisible('bikes')
    if (!visible) {
      setBikes([])
      return undefined
    }

    const load = async () => {
      try {
        const res = await fetch('/api/momochari', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed: ${res.status}`)
        const payload = await res.json()
        if (Array.isArray(payload.bikes)) {
          setBikes(payload.bikes as Bike[])
        }
        if (typeof payload.credit === 'string') {
          setBikeCredit(payload.credit)
        }
        const interval = typeof payload.intervalSec === 'number' ? payload.intervalSec : 15
        if (timer) clearTimeout(timer)
        timer = setTimeout(load, interval * 1000)
      } catch (err) {
        console.error('Failed to fetch momochari data:', err)
        if (timer) clearTimeout(timer)
        timer = setTimeout(load, 20000)
      }
    }

    load()

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isLayerVisible])

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null
    const visible = isLayerVisible('rain')
    if (!visible) return undefined

    const load = async () => {
      try {
        const res = await fetch('/api/nowc', { cache: 'no-store' })
        if (!res.ok) throw new Error(`Failed: ${res.status}`)
        const payload = await res.json()
        if (payload && typeof payload.baseTime === 'string' && typeof payload.validTime === 'string') {
          setRainTarget({ baseTime: payload.baseTime, validTime: payload.validTime })
        }
        if (timer) clearTimeout(timer)
        timer = setTimeout(load, 5 * 60 * 1000)
      } catch (err) {
        console.error('Failed to fetch nowcast target time:', err)
        if (timer) clearTimeout(timer)
        timer = setTimeout(load, 60 * 1000)
      }
    }

    load()

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [isLayerVisible])

  const projection = useMemo(() => {
    if (!size.width || !size.height) return null
    const centerWorld = projectLatLonToWorld(center[0], center[1], displayZoom)
    const projectPoint: ProjectPoint = (lat, lon) => {
      const world = projectLatLonToWorld(lat, lon, displayZoom)
      return {
        x: world.x - centerWorld.x + size.width / 2,
        y: world.y - centerWorld.y + size.height / 2,
      }
    }
    return { projectPoint, centerWorld }
  }, [center, displayZoom, size.width, size.height])

  const panFromOrigin = useCallback((origin: [number, number], dx: number, dy: number) => {
    const originWorld = projectLatLonToWorld(origin[0], origin[1], displayZoom)
    const nextLatLon = unprojectWorldToLatLon(originWorld.x - dx, originWorld.y - dy, displayZoom)
    return nextLatLon
  }, [displayZoom])

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    setTooltip(null)
    pointerState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originCenter: center,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointerState.current || !projection) return
    const dx = event.clientX - pointerState.current.startX
    const dy = event.clientY - pointerState.current.startY
    const nextCenter = panFromOrigin(pointerState.current.originCenter, dx, dy)
    setCenter(nextCenter)
  }

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    setTooltip(null)
    if (pointerState.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      pointerState.current = null
    }
  }

  const handleWheel = (event: React.WheelEvent) => {
    // ブラウザのスクロールは許可しつつ、ズームだけ反映（感度をさらに 0.25 段階に下げる）
    const direction = event.deltaY > 0 ? -0.25 : 0.25
    setZoom((prev) => clampZoom(prev + direction))
  }

  const handleMarkerClick = (shelter: Shelter) => {
    if (!onShelterClick) return
    onShelterClick({
      ...shelter,
      type: 'general',
      address: shelter.summary,
    })
  }

  const showTooltip = useCallback((label: string, point: ScreenPoint) => {
    setTooltip({ label, x: point.x, y: point.y - 18 })
  }, [])

  const hideTooltip = useCallback(() => {
    setTooltip(null)
  }, [])

  const handleLocate = () => {
    if (!('geolocation' in navigator)) {
      alert('お使いのブラウザは位置情報に対応していません')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude]
        setCenter(coords)
        setZoom((prev) => Math.max(prev, 15))
        setGpsPosition(coords)
      },
      (error) => {
        alert(`現在地を取得できませんでした: ${error.message}`)
      }
    )
  }

  const projectedShelters = useMemo(() => {
    if (!projection || !isLayerVisible('spots')) return []
    return shelters.map((shelter) => {
      const point = projection.projectPoint(shelter.lat, shelter.lon)
      if (!point) return null
      const iconUrl = markerIconMap[shelter.kind] || markerIconMap.tourist
      return { shelter, point, iconUrl }
    }).filter(Boolean) as { shelter: Shelter, point: ScreenPoint, iconUrl: string }[]
  }, [isLayerVisible, projection, shelters])

  const projectedWeather = useMemo(() => {
    if (!projection || !isLayerVisible('weather')) return []
    return weatherData.map((weather) => {
      const point = projection.projectPoint(weather.lat, weather.lon)
      return point ? { point, weather } : null
    }).filter(Boolean) as { point: ScreenPoint, weather: typeof weatherData[number] }[]
  }, [isLayerVisible, projection])

  const pointCircles = useCallback((
    collection: FeatureCollection | null,
    prefix: string,
    getLabel?: (feature: Feature) => string
  ) => {
    if (!collection || !projection) return []
    const circles: { key: string, point: ScreenPoint, label: string }[] = []
    collection.features.forEach((feature, index) => {
      const points = geometryPoints(feature.geometry, projection.projectPoint)
      points.forEach((point, pointIndex) => {
        const label = getLabel ? getLabel(feature) : ''
        circles.push({ key: `${prefix}-${index}-${pointIndex}`, point, label })
      })
    })
    return circles
  }, [projection])

  const realShelterPoints = useMemo(() => {
    if (!isLayerVisible('realShelters')) return []
    return pointCircles(
      shelterGeoData,
      'realShelter',
      (feature) => getFeatureLabel(feature.properties as Record<string, unknown> | null | undefined, ['P20_002', 'P20_004'], '避難施設')
    )
  }, [isLayerVisible, pointCircles, shelterGeoData])

  const bikePoints = useMemo(() => {
    if (!projection || !isLayerVisible('bikes')) return []
    return bikes.map((bike) => {
      const point = projection.projectPoint(bike.lat, bike.lon)
      return point ? { key: bike.id, point, bike } : null
    }).filter(Boolean) as { key: string, point: ScreenPoint, bike: Bike }[]
  }, [bikes, isLayerVisible, projection])

  const landslideWorldPath = useMemo(() => {
    if (!isLayerVisible('landslide') || !landslideData) return null
    const simplifyStep = getSimplifyStepForLayer('landslide')
    const parts: string[] = []
    landslideData.features.forEach((feature) => {
      const geometry = feature.geometry
      if (!geometry) return
      if (geometry.type === 'Polygon') {
        const d = polygonToWorldPath(geometry.coordinates as Position[][], displayZoom, simplifyStep)
        if (d) parts.push(d)
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach((polygon) => {
          const d = polygonToWorldPath(polygon as Position[][], displayZoom, simplifyStep)
          if (d) parts.push(d)
        })
      }
    })
    return parts.length ? parts.join(' ') : null
  }, [displayZoom, getSimplifyStepForLayer, isLayerVisible, landslideData])

  const riverWorldPath = useMemo(() => {
    if (!isLayerVisible('rivers') || !riversData) return null
    const simplifyStep = getSimplifyStepForLayer('rivers')
    const parts: string[] = []
    riversData.features.forEach((feature) => {
      const geometry = feature.geometry
      if (!geometry) return
      if (geometry.type === 'LineString') {
        const d = lineToWorldPath(geometry.coordinates as Position[], displayZoom, simplifyStep)
        if (d) parts.push(d)
      } else if (geometry.type === 'MultiLineString') {
        geometry.coordinates.forEach((line) => {
          const d = lineToWorldPath(line as Position[], displayZoom, simplifyStep)
          if (d) parts.push(d)
        })
      }
    })
    return parts.length ? parts.join(' ') : null
  }, [displayZoom, getSimplifyStepForLayer, isLayerVisible, riversData])

  const basemapTiles = useMemo(() => {
    if (!projection || !size.width || !size.height) return []
    const tiles: { key: string, x: number, y: number, href: string, tileX: number, tileY: number }[] = []
    const zoomLevel = displayZoom
    const numTiles = Math.pow(2, zoomLevel)
    const topLeft = {
      x: projection.centerWorld.x - size.width / 2,
      y: projection.centerWorld.y - size.height / 2,
    }
    const bottomRight = {
      x: projection.centerWorld.x + size.width / 2,
      y: projection.centerWorld.y + size.height / 2,
    }
    const startTileX = Math.floor(topLeft.x / TILE_SIZE)
    const endTileX = Math.floor(bottomRight.x / TILE_SIZE)
    const startTileY = Math.floor(topLeft.y / TILE_SIZE)
    const endTileY = Math.floor(bottomRight.y / TILE_SIZE)

    for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
      for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
        if (tileY < 0 || tileY >= numTiles) continue
        const wrappedX = wrapTileIndex(tileX, numTiles)
        const tileOriginX = tileX * TILE_SIZE - topLeft.x
        const tileOriginY = tileY * TILE_SIZE - topLeft.y
        const href = tileBaseUrl.includes('{z}')
          ? tileBaseUrl
              .replace('{z}', String(zoomLevel))
              .replace('{x}', String(wrappedX))
              .replace('{y}', String(tileY))
          : `${tileBaseUrl}/${zoomLevel}/${wrappedX}/${tileY}.png`
        tiles.push({
          key: `${wrappedX}-${tileY}-${zoomLevel}`,
          x: tileOriginX,
          y: tileOriginY,
          href,
          tileX: wrappedX,
          tileY,
        })
      }
    }
    return tiles
  }, [displayZoom, projection, size.height, size.width])

  const rainTiles = useMemo(() => {
    if (!isLayerVisible('rain') || !rainTarget) return []
    return basemapTiles.map((tile) => ({
      key: `rain-${tile.key}`,
      x: tile.x,
      y: tile.y,
      href: buildNowcastTileUrl(rainTarget, displayZoom, tile.tileX, tile.tileY),
    }))
  }, [basemapTiles, displayZoom, isLayerVisible, rainTarget])

  const slopeOverlay = useMemo(() => {
    if (!projection || !isLayerVisible('slope')) return null
    const worldTopLeft = projectMercatorToWorld(SLOPE_MERCATOR_BOUNDS.minX, SLOPE_MERCATOR_BOUNDS.maxY, displayZoom)
    const worldBottomRight = projectMercatorToWorld(SLOPE_MERCATOR_BOUNDS.maxX, SLOPE_MERCATOR_BOUNDS.minY, displayZoom)
    const left = worldTopLeft.x - projection.centerWorld.x + size.width / 2
    const top = worldTopLeft.y - projection.centerWorld.y + size.height / 2
    const width = worldBottomRight.x - worldTopLeft.x
    const height = worldBottomRight.y - worldTopLeft.y
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
    return { left, top, width, height }
  }, [displayZoom, isLayerVisible, projection, size.height, size.width])

  const gpsMarker = useMemo(() => {
    if (!gpsPosition || !projection) return null
    const point = projection.projectPoint(gpsPosition[0], gpsPosition[1])
    return point ? point : null
  }, [gpsPosition, projection])

  const mapTranslate = useMemo(() => {
    if (!projection) return null
    return {
      x: formatNumber(-projection.centerWorld.x + size.width / 2),
      y: formatNumber(-projection.centerWorld.y + size.height / 2),
    }
  }, [projection, size.height, size.width])


  // モードに応じたCSS classを取得
  const modeClass = mapModes[currentMode].cssClass

  return (
    <div className={`w-full h-full relative bg-gray-100 ${modeClass}`} ref={setContainerRef}>
      {mapReady && projection && size.width > 0 && size.height > 0 && (
        <>
          <svg
            className="absolute inset-0 w-full h-full touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onWheel={handleWheel}
          >
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {activeLayers.basemap && (
              <g>
                {basemapTiles.map((tile) => (
                  <image
                    key={tile.key}
                    href={tile.href}
                    x={tile.x}
                    y={tile.y}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                    preserveAspectRatio="none"
                  />
                ))}
              </g>
            )}

            {slopeOverlay && (
              <image
                href="/map/layers/slope_okayama_3857.png"
                x={slopeOverlay.left}
                y={slopeOverlay.top}
                width={slopeOverlay.width}
                height={slopeOverlay.height}
                opacity={0.55}
                preserveAspectRatio="none"
              />
            )}

            {isLayerVisible('rain') && rainTiles.length > 0 && (
              <g opacity={0.65}>
                {rainTiles.map((tile) => (
                  <image
                    key={tile.key}
                    href={tile.href}
                    x={tile.x}
                    y={tile.y}
                    width={TILE_SIZE}
                    height={TILE_SIZE}
                    preserveAspectRatio="none"
                  />
                ))}
              </g>
            )}

            {mapTranslate && (
              <g transform={`translate(${mapTranslate.x} ${mapTranslate.y})`} pointerEvents="none">
                {landslideWorldPath && (
                  <path
                    d={landslideWorldPath}
                    fill="#f97316"
                    fillOpacity={0.35}
                    stroke="#c2410c"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    fillRule="evenodd"
                    shapeRendering="optimizeSpeed"
                  />
                )}

                {riverWorldPath && (
                  <path
                    d={riverWorldPath}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeOpacity={0.7}
                    vectorEffect="non-scaling-stroke"
                    shapeRendering="optimizeSpeed"
                  />
                )}
              </g>
            )}

            {gpsMarker && (
              <g>
                <circle cx={gpsMarker.x} cy={gpsMarker.y} r={8} fill="#2563eb22" />
                <circle cx={gpsMarker.x} cy={gpsMarker.y} r={4} fill="#1d4ed8" stroke="#fff" strokeWidth={1.5} />
              </g>
            )}
          </svg>

          <div className="pointer-events-none absolute inset-0 z-10">
            {activeLayers.spots && projectedShelters.map(({ shelter, point, iconUrl }) => (
              <button
                key={shelter.id}
                className="absolute -translate-x-1/2 -translate-y-full pointer-events-auto"
                style={{ left: point.x, top: point.y }}
                onClick={() => handleMarkerClick(shelter)}
              >
                <Image
                  src={iconUrl}
                  width={19}
                  height={27}
                  alt={shelter.name}
                  className="drop-shadow"
                />
              </button>
            ))}

            {activeLayers.realShelters && realShelterPoints.map((circle) => (
              <button
                key={circle.key}
                className="absolute -translate-x-1/2 -translate-y-full pointer-events-auto"
                style={{ left: circle.point.x, top: circle.point.y }}
                onPointerEnter={(event) => {
                  event.stopPropagation()
                  showTooltip(circle.label, circle.point)
                }}
                onPointerLeave={(event) => {
                  event.stopPropagation()
                  hideTooltip()
                }}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  showTooltip(circle.label, circle.point)
                }}
              >
                <Image
                  src={layerPinIcons.realShelters}
                  width={19}
                  height={27}
                  alt={circle.label}
                  className="drop-shadow"
                />
              </button>
            ))}

            {activeLayers.weather && projectedWeather.map(({ weather, point }, index) => (
              <div
                key={`weather-${index}`}
                className="absolute -translate-x-1/2 -translate-y-[110%] pointer-events-none"
                style={{ left: point.x, top: point.y }}
              >
                <WeatherBadge label={weather.name} temp={weather.temp} wind={weather.wind} />
              </div>
            ))}

            {bikePoints.map(({ key, point, bike }) => {
              const visited = visitedBikeIds.includes(bike.id)
              const label = bike.status ? `${bike.id} (${bike.status})` : bike.id
              // JSONからfloodRankを取得、なければデフォルトで0（安全）
              const floodRank = bike.floodRank ?? 0
              return (
                <button
                  key={key}
                  type="button"
                  className="momochari-port absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                  data-flood-rank={floodRank}
                  style={{ left: point.x, top: point.y }}
                  title={label}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    setVisitedBikeIds((prev) => (prev.includes(bike.id) ? prev : [...prev, bike.id]))
                    showTooltip(label, point)
                  }}
                >
                  <span
                    className={[
                      'block w-3 h-3 rounded-full shadow ring-2 ring-white transition-all duration-300',
                      visited ? 'bg-amber-500' : 'bg-emerald-500',
                    ].join(' ')}
                  />
                </button>
              )
            })}

            {tooltip && (
              <div
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-3 rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-xs font-semibold text-slate-800 shadow"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                {tooltip.label}
              </div>
            )}
          </div>

          {isLayerVisible('bikes') && bikes.length > 0 && (
            <div className="absolute left-4 top-16 z-20 max-w-xs">
              <NearbyPortsPanel
                bikes={bikes}
                gpsPosition={gpsPosition}
                visitedCount={visitedBikeIds.length}
                totalCount={bikes.length}
                onPortClick={(bike) => {
                  setCenter([bike.lat, bike.lon])
                  setZoom((prev) => Math.max(prev, 15))
                  setVisitedBikeIds((prev) => (prev.includes(bike.id) ? prev : [...prev, bike.id]))
                }}
              />
            </div>
          )}

          <div className="absolute left-4 bottom-4 z-20">
            <MapControls
          onZoomIn={() => setZoom((prev) => clampZoom(prev + 0.25))}
          onZoomOut={() => setZoom((prev) => clampZoom(prev - 0.25))}
              onLocate={handleLocate}
            />
          </div>

          <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-2">
            <CreditBadge
              label="地図タイル: 地理院タイル（国土地理院）"
              href="https://maps.gsi.go.jp/development/ichiran.html"
            />
            {isLayerVisible('rain') && (
              <CreditBadge
                label="降水: 気象庁ナウキャスト"
                href="https://www.jma.go.jp/bosai/nowc/"
              />
            )}
            {bikeCredit && (
              <CreditBadge
                label={`ももチャリ: ${bikeCredit}`}
                href="https://www.okayama-opendata.jp/"
              />
            )}
            {isLayerVisible('slope') && (
              <>
                <CreditBadge
                  label="出典: 国土地理院（地理院タイル一覧）"
                  href="https://maps.gsi.go.jp/development/ichiran.html"
                />
                <CreditBadge
                  label="地理院タイル（標高タイル（基盤地図情報数値標高モデル））を加工して作成"
                  href="https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html"
                />
              </>
            )}
          </div>
        </>
      )}

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 z-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-6"></div>
            <p className="text-gray-700 font-semibold text-lg mb-2">地図を読み込んでいます...</p>
            <p className="text-gray-500 text-sm">少々お待ちください</p>
          </div>
        </div>
      )}
    </div>
  )
}
