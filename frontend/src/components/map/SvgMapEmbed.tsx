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
import type { MapFeatureProperties } from '@/features/map/engine/featureTypes'
import type {
  CurrentMapRuntimeCommand,
  CurrentMapRuntimeEvent,
  CurrentMapViewState,
  OverviewLayerPayload,
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
  overviewLayer?: OverviewLayerPayload | null
  initialViewport?: MapViewport
  viewport?: MapViewport
  onMapMove?: (viewport: MapViewport) => void
  onSelectedFeatureChange?: (feature: MapFeatureProperties | null) => void
  onRuntimeReady?: () => void
  onRuntimeError?: (message: string) => void
  regionConfig?: CurrentMapRegionConfig
}

const visibleLayerIdsFromMap = (
  activeLayers: Record<string, boolean>,
  suppressAll = false
): CurrentMapLayerId[] =>
  suppressAll ? [] : currentMapLayerIds.filter((layerId) => Boolean(activeLayers[layerId]))

const visibleLayerIdsForSvgMap = (activeLayers: Record<string, boolean>, suppressAll = false): CurrentMapLayerId[] =>
  visibleLayerIdsFromMap(activeLayers, suppressAll)

const toMapViewState = (
  viewport: MapViewport,
  visibleLayerIds: CurrentMapLayerId[],
  layerOpacity: CurrentMapViewState['layerOpacity']
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
})

const isRuntimeEvent = (data: unknown): data is CurrentMapRuntimeEvent =>
  Boolean(data && typeof data === 'object' && 'type' in data)

const isSameViewport = (a?: MapViewport | null, b?: MapViewport | null) => {
  if (!a || !b) return false
  return (
    Math.abs(a.lat - b.lat) < 0.00001 &&
    Math.abs(a.lon - b.lon) < 0.00001 &&
    Math.abs(a.zoom - b.zoom) < 0.00001 &&
    Math.abs((a.latSpan ?? 0) - (b.latSpan ?? 0)) < 0.00001 &&
    Math.abs((a.lonSpan ?? 0) - (b.lonSpan ?? 0)) < 0.00001
  )
}

export default function SvgMapEmbed({
  activeLayers,
  layerOpacity = currentMapDefaultLayerOpacity,
  overviewLayer = null,
  initialViewport,
  viewport,
  onMapMove,
  onSelectedFeatureChange,
  onRuntimeReady,
  onRuntimeError,
  regionConfig = currentMapRegionConfig,
}: SvgMapEmbedProps) {
  const currentMapTitle = getCurrentMapDisplayTitle(regionConfig)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const hasAppliedInitialViewportRef = useRef(false)
  const lastRequestedViewportRef = useRef<MapViewport | null>(null)
  const [ready, setReady] = useState(false)
  const [liveViewport, setLiveViewport] = useState<MapViewport | null>(initialViewport ?? null)
  const normalizedLayerOpacity = useMemo(() => sanitizeCurrentMapLayerOpacity(layerOpacity), [layerOpacity])
  const overviewEnabled = Boolean(overviewLayer?.enabled)

  const iframeSrc = useMemo(
    () => {
      const params = new URLSearchParams({
        embed: '1',
        basemap: '0',
        regionId: regionConfig.regionId,
        runtimeConfigUrl: regionConfig.runtimeConfigUrl,
        baseAreaLayerUrl: regionConfig.svgBaseAreaLayerUrl,
      })
      return `/map/webapp/shelters.html?${params.toString()}`
    },
    [
      regionConfig.regionId,
      regionConfig.runtimeConfigUrl,
      regionConfig.svgBaseAreaLayerUrl,
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
        onSelectedFeatureChange?.(data.payload.feature as MapFeatureProperties)
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
      payload: visibleLayerIdsForSvgMap(activeLayers, overviewEnabled),
    })
  }, [activeLayers, overviewEnabled, ready])

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
        visibleLayerIdsForSvgMap(activeLayers, overviewEnabled),
        normalizedLayerOpacity
      ),
    })
  }, [activeLayers, initialViewport, normalizedLayerOpacity, overviewEnabled, ready])

  useEffect(() => {
    if (!ready || !viewport) return
    if (isSameViewport(liveViewport, viewport)) return
    if (isSameViewport(lastRequestedViewportRef.current, viewport)) return
    lastRequestedViewportRef.current = viewport
    postToSvgMap({
      type: 'runtime:setView',
      payload: toMapViewState(
        viewport,
        visibleLayerIdsForSvgMap(activeLayers, overviewEnabled),
        normalizedLayerOpacity
      ),
    })
  }, [
    activeLayers,
    liveViewport,
    normalizedLayerOpacity,
    overviewEnabled,
    ready,
    viewport,
  ])

  useEffect(() => {
    if (!ready) return
    postToSvgMap({
      type: 'runtime:setOverviewLayer',
      payload: overviewLayer?.enabled
        ? {
            enabled: true,
            src: overviewLayer.src,
            kind: overviewLayer.kind,
            prefCode: overviewLayer.prefCode,
            bounds: overviewLayer.bounds,
          }
        : { enabled: false },
    })
  }, [overviewLayer, ready])

  // Reset tracking refs on iframe reload so we always re-send after ready.
  useEffect(() => {
    if (!ready) {
      lastRequestedViewportRef.current = null
    }
  }, [ready])

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
    </div>
  )
}
