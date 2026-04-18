'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  currentMapDefaultLayerOpacity,
  sanitizeCurrentMapLayerOpacity,
} from '@/features/map/engine/layerOpacity'
import {
  currentMapRegionConfig,
  getCurrentMapDisplayTitle,
  type CurrentMapRegionConfig,
} from '@/lib/currentMapRegion'
import type {
  CurrentMapFeatureProperties,
  MapFeatureProperties,
} from '@/features/map/engine/featureTypes'
import type {
  CurrentMapRuntimeCommand,
  CurrentMapRuntimeEvent,
  CurrentMapViewState,
} from '@/features/map/engine/runtimeProtocol'
import { currentMapLayerIds, type CurrentMapLayerId } from '@/lib/currentMapLayers'

type MapViewport = {
  lat: number
  lon: number
  zoom: number
  latSpan?: number
  lonSpan?: number
}

type LocationOverlay = {
  lat: number
  lon: number
  accuracy?: number
}

interface SvgMapEmbedProps {
  activeLayers: Record<string, boolean>
  layerOpacity?: Record<string, number>
  detailBasemapEnabled?: boolean
  viewportConstraint?: {
    minZoom?: number
    maxBounds?: [[number, number], [number, number]]
  }
  highlightTarget?: MapViewport & { token: number }
  selectedFeatureId?: string
  initialViewport?: MapViewport
  viewport?: MapViewport
  currentLocation?: LocationOverlay | null
  controlCommand?: { token: number; command: CurrentMapRuntimeCommand } | null
  reloadToken?: number
  onMapMove?: (viewport: MapViewport) => void
  onSelectedFeatureChange?: (feature: CurrentMapFeatureProperties | null) => void
  onRuntimeReady?: () => void
  onRuntimeError?: (message: string) => void
  regionConfig?: CurrentMapRegionConfig
  selectedMuniCode?: string | null
}

function buildPrefectureCandidates(value: string): string[] {
  const normalized = String(value || '').trim()
  if (!normalized) return []
  const candidates = new Set<string>([normalized])
  if (normalized === '北海道') return Array.from(candidates)
  if (/(都|道|府|県)$/.test(normalized)) {
    candidates.add(normalized.replace(/(都|道|府|県)$/, ''))
    return Array.from(candidates)
  }
  candidates.add(`${normalized}県`)
  if (normalized === '東京') candidates.add('東京都')
  if (normalized === '京都') candidates.add('京都府')
  if (normalized === '大阪') candidates.add('大阪府')
  if (normalized === '北海' || normalized === '北海道') candidates.add('北海道')
  return Array.from(candidates)
}

function usePrefectureMaskPath(regionConfig: CurrentMapRegionConfig) {
  const [maskPolygons, setMaskPolygons] = useState<number[][][][]>([])
  const candidates = useMemo(
    () => (regionConfig.regionId !== 'japan' ? buildPrefectureCandidates(regionConfig.regionLabel) : []),
    [regionConfig.regionId, regionConfig.regionLabel]
  )

  useEffect(() => {
    if (candidates.length === 0) {
      setMaskPolygons([])
      return
    }
    let cancelled = false
    fetch('/data/source/national/prefectures-low.geojson', { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((geojson) => {
        if (cancelled) return
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        const matched = features.filter((f: any) =>
          candidates.includes(String(f?.properties?.pref || '').trim())
        )
        const rings: number[][][] = []
        for (const f of matched) {
          const geom = f?.geometry
          if (!geom) continue
          if (geom.type === 'Polygon') {
            if (geom.coordinates?.[0]) rings.push(geom.coordinates[0])
          } else if (geom.type === 'MultiPolygon') {
            for (const poly of geom.coordinates || []) {
              if (poly?.[0]) rings.push(poly[0])
            }
          }
        }
        setMaskPolygons(rings.length > 0 ? [rings] : [])
      })
      .catch(() => {
        if (!cancelled) setMaskPolygons([])
      })
    return () => { cancelled = true }
  }, [candidates])

  return maskPolygons.length > 0 ? maskPolygons[0] : null
}

const visibleLayerIdsFromMap = (activeLayers: Record<string, boolean>): CurrentMapLayerId[] =>
  currentMapLayerIds.filter((layerId) => Boolean(activeLayers[layerId]))

const visibleLayerIdsForSvgMap = (activeLayers: Record<string, boolean>): CurrentMapLayerId[] =>
  visibleLayerIdsFromMap(activeLayers)

const toMapViewState = (
  viewport: MapViewport,
  visibleLayerIds: CurrentMapLayerId[],
  layerOpacity: CurrentMapViewState['layerOpacity'],
  selectedFeatureId?: string
): CurrentMapViewState => ({
  engine: 'svgmap',
  center: {
    lat: viewport.lat,
    lon: viewport.lon,
  },
  zoom: viewport.zoom,
  span: viewport.lonSpan ?? viewport.latSpan,
  latSpan: viewport.latSpan,
  lonSpan: viewport.lonSpan,
  visibleLayerIds,
  layerOpacity,
  selectedFeatureId,
})

const isRuntimeEvent = (data: unknown): data is CurrentMapRuntimeEvent =>
  Boolean(data && typeof data === 'object' && 'type' in data)

export default function SvgMapEmbed({
  activeLayers,
  layerOpacity = currentMapDefaultLayerOpacity,
  detailBasemapEnabled = true,
  viewportConstraint,
  highlightTarget,
  selectedFeatureId,
  initialViewport,
  viewport,
  currentLocation,
  controlCommand,
  reloadToken = 0,
  onMapMove,
  onSelectedFeatureChange,
  onRuntimeReady,
  onRuntimeError,
  regionConfig = currentMapRegionConfig,
  selectedMuniCode,
}: SvgMapEmbedProps) {
  const currentMapTitle = getCurrentMapDisplayTitle(regionConfig)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const hasAppliedInitialViewportRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [liveViewport, setLiveViewport] = useState<MapViewport | null>(initialViewport ?? null)
  const activeBaseAreaHrefRef = useRef<string | null>(null)
  const normalizedLayerOpacity = useMemo(() => sanitizeCurrentMapLayerOpacity(layerOpacity), [layerOpacity])

  const iframeSrc = useMemo(
    () => {
      const params = new URLSearchParams({
        embed: '1',
        basemap: detailBasemapEnabled ? '1' : '0',
        rt: String(reloadToken),
        regionId: regionConfig.regionId,
        runtimeConfigUrl: regionConfig.runtimeConfigUrl,
        baseAreaLayerUrl: regionConfig.svgBaseAreaLayerUrl,
      })
      if (Number.isFinite(viewportConstraint?.minZoom)) {
        params.set('minZoom', String(viewportConstraint?.minZoom))
      }
      if (viewportConstraint?.maxBounds) {
        const [[west, south], [east, north]] = viewportConstraint.maxBounds
        params.set('bounds', [west, south, east, north].join(','))
      }
      return `/map/webapp/shelters.html?${params.toString()}`
    },
    [
      detailBasemapEnabled,
      regionConfig.regionId,
      regionConfig.runtimeConfigUrl,
      regionConfig.svgBaseAreaLayerUrl,
      reloadToken,
      viewportConstraint,
    ]
  )

  const postToSvgMap = (message: CurrentMapRuntimeCommand) => {
    if (typeof window === 'undefined') return
    iframeRef.current?.contentWindow?.postMessage(message, window.location.origin)
  }

  useEffect(() => {
    setLiveViewport(viewport ?? initialViewport ?? null)
  }, [initialViewport, viewport])

  useEffect(() => {
    if (!ready) return

    let frameId = 0

    const readRuntimeViewport = () => {
      const svgMapWindow = iframeRef.current?.contentWindow as
        | (Window & {
            svgMap?: {
              getGeoViewBox?: () => {
                cx?: number
                cy?: number
                width?: number
                height?: number
              } | null
            }
          })
        | null
      const viewBox = svgMapWindow?.svgMap?.getGeoViewBox?.()
      if (viewBox) {
        const lat = Number(viewBox.cy)
        const lon = Number(viewBox.cx)
        const lonSpan = Number(viewBox.width)
        const latSpan = Number(viewBox.height)
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lon) &&
          Number.isFinite(latSpan) &&
          Number.isFinite(lonSpan)
        ) {
          setLiveViewport((prev) => {
            if (
              prev &&
              Math.abs(prev.lat - lat) < 0.00001 &&
              Math.abs(prev.lon - lon) < 0.00001 &&
              Math.abs((prev.latSpan ?? 0) - latSpan) < 0.00001 &&
              Math.abs((prev.lonSpan ?? 0) - lonSpan) < 0.00001
            ) {
              return prev
            }

            const zoom =
              Number.isFinite(lonSpan) && lonSpan > 0
                ? Math.min(18, Math.max(0, Math.log2(360 / lonSpan)))
                : prev?.zoom ?? viewport?.zoom ?? initialViewport?.zoom ?? 11

            return {
              lat,
              lon,
              zoom,
              latSpan,
              lonSpan,
            }
          })
        }
      }

      frameId = window.requestAnimationFrame(readRuntimeViewport)
    }

    frameId = window.requestAnimationFrame(readRuntimeViewport)
    return () => window.cancelAnimationFrame(frameId)
  }, [initialViewport?.zoom, ready, viewport?.zoom])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (!isRuntimeEvent(event.data)) return

      const data = event.data

      if (data.type === 'runtime:ready') {
        setReady(true)
        onRuntimeReady?.()
        return
      }

      if (data.type === 'runtime:error') {
        setReady(false)
        onRuntimeError?.(data.payload?.message || 'Runtime error')
        return
      }

      if (data.type === 'runtime:featureSelect' && data.payload?.feature) {
        onSelectedFeatureChange?.(data.payload.feature as MapFeatureProperties as CurrentMapFeatureProperties)
        return
      }

      if (data.type === 'runtime:viewChange' && data.payload && onMapMove) {
        const payload = data.payload
        if (
          typeof payload.center?.lat === 'number' &&
          typeof payload.center?.lon === 'number' &&
          typeof payload.zoom === 'number'
        ) {
          onMapMove({
            lat: payload.center.lat,
            lon: payload.center.lon,
            zoom: payload.zoom,
            latSpan: payload.latSpan ?? payload.span,
            lonSpan: payload.lonSpan ?? payload.span,
          })
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onMapMove, onRuntimeError, onRuntimeReady, onSelectedFeatureChange])

  useEffect(() => {
    if (!ready) return
    postToSvgMap({
      type: 'runtime:setLayers',
      payload: visibleLayerIdsForSvgMap(activeLayers),
    })
  }, [activeLayers, ready])

  useEffect(() => {
    if (!ready) return
    postToSvgMap({
      type: 'runtime:setOpacity',
      payload: normalizedLayerOpacity,
    })
  }, [normalizedLayerOpacity, ready])

  useEffect(() => {
    if (!ready || !initialViewport || hasAppliedInitialViewportRef.current) return
    hasAppliedInitialViewportRef.current = true
    postToSvgMap({
      type: 'runtime:setView',
      payload: toMapViewState(
        initialViewport,
        visibleLayerIdsForSvgMap(activeLayers),
        normalizedLayerOpacity
      ),
    })
  }, [activeLayers, initialViewport, normalizedLayerOpacity, ready])

  useEffect(() => {
    if (!ready || !highlightTarget) return
    postToSvgMap({
      type: 'runtime:setView',
      payload: toMapViewState(
        highlightTarget,
        visibleLayerIdsForSvgMap(activeLayers),
        normalizedLayerOpacity
      ),
    })
  }, [activeLayers, highlightTarget, normalizedLayerOpacity, ready])

  useEffect(() => {
    if (!ready || !viewport) return
    postToSvgMap({
      type: 'runtime:setView',
      payload: toMapViewState(
        viewport,
        visibleLayerIdsForSvgMap(activeLayers),
        normalizedLayerOpacity
      ),
    })
  }, [activeLayers, normalizedLayerOpacity, ready, viewport])

  useEffect(() => {
    if (!ready || !controlCommand) return
    postToSvgMap(controlCommand.command)
  }, [controlCommand, ready])

  // Reset tracking ref on iframe reload so we always re-send after ready.
  useEffect(() => {
    if (!ready) activeBaseAreaHrefRef.current = null
  }, [ready])

  // A+B: zoom-triggered + muni hot-swap for base area SVG layer.
  useEffect(() => {
    if (!ready) return
    const SVG_DISTRICT_ZOOM_THRESHOLD = 12
    const zoom = liveViewport?.zoom ?? initialViewport?.zoom ?? 0
    const simpleUrl = regionConfig.svgBaseAreaSimpleLayerUrl ?? null
    const muniUrl = selectedMuniCode
      ? (regionConfig.districtSvgIndexByMunicipality?.[selectedMuniCode] ?? null)
      : null
    const defaultUrl = regionConfig.svgBaseAreaLayerUrl

    let targetHref: string
    if (zoom < SVG_DISTRICT_ZOOM_THRESHOLD && simpleUrl) {
      targetHref = simpleUrl
    } else if (zoom >= SVG_DISTRICT_ZOOM_THRESHOLD && muniUrl) {
      targetHref = muniUrl
    } else {
      targetHref = simpleUrl ?? defaultUrl
    }

    if (activeBaseAreaHrefRef.current === targetHref) return
    activeBaseAreaHrefRef.current = targetHref
    postToSvgMap({ type: 'runtime:setBaseAreaLayer', payload: { href: targetHref } })
  }, [ready, liveViewport?.zoom, initialViewport?.zoom, regionConfig, selectedMuniCode])

  const prefectureMaskRings = usePrefectureMaskPath(regionConfig)
  const overlayViewport = liveViewport ?? viewport ?? initialViewport

  return (
    <div className="w-full h-full relative bg-[#f5f1ea]">
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title={`SVGMap ${currentMapTitle}`}
        allow="geolocation"
        onLoad={() => {
          setReady(false)
          hasAppliedInitialViewportRef.current = false
          postToSvgMap({ type: 'runtime:statusRequest' })
        }}
        className="absolute inset-0 w-full h-full border-0"
      />
      {prefectureMaskRings && overlayViewport && (() => {
        const latSpan = overlayViewport.latSpan ?? overlayViewport.lonSpan ?? 0
        const lonSpan = overlayViewport.lonSpan ?? overlayViewport.latSpan ?? 0
        if (!latSpan || !lonSpan) return null
        const west = overlayViewport.lon - lonSpan / 2
        const north = overlayViewport.lat + latSpan / 2
        const toX = (lon: number) => ((lon - west) / lonSpan) * 100
        const toY = (lat: number) => ((north - lat) / latSpan) * 100
        // 画面全体の外周
        const outerPath = 'M -10,-10 L 110,-10 L 110,110 L -10,110 Z'
        // 県のポリゴンをくり抜き穴として追加
        const holePaths = prefectureMaskRings.map((ring) => {
          const points = ring.map(([lon, lat]) => `${toX(lon).toFixed(2)},${toY(lat).toFixed(2)}`)
          return `M ${points[0]} L ${points.slice(1).join(' L ')} Z`
        })
        const d = `${outerPath} ${holePaths.join(' ')}`
        return (
          <svg
            className="absolute inset-0 w-full h-full z-10 pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path d={d} fill="#f8fafc" fillRule="evenodd" />
          </svg>
        )
      })()}
    </div>
  )
}
