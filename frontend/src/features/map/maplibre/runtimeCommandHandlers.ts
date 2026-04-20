import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { CurrentMapLayerId } from '@/features/map/engine/layerDefinitions'
import { mergeCurrentMapLayerOpacity } from '@/features/map/engine/layerOpacity'
import type { CurrentMapRuntimeCommand } from '@/features/map/engine/runtimeProtocol'
import { toCurrentMapLayerVisibilityMap } from '@/lib/currentMapLayers'
import { applyMapLibreViewState } from '@/features/map/maplibre/cameraSpanHelpers'

type ViewportState = {
  longitude: number
  latitude: number
  zoom: number
}


type RuntimeView = {
  lat: number
  lon: number
  zoom: number
}

type RuntimeViewOptions = {
  span?: number
  latSpan?: number
  lonSpan?: number
  visibleLayerIds: CurrentMapLayerId[]
  layerOpacity?: Partial<Record<CurrentMapLayerId, number>>
}

type ApplyMapLibreRuntimeCommandArgs = {
  command: CurrentMapRuntimeCommand
  mapRef: MutableRefObject<any>
  mapLoaded: boolean
  viewport: ViewportState
  getVisibleLayerIds: () => CurrentMapLayerId[]
  layerOpacity: Partial<Record<CurrentMapLayerId, number>>
  layerOpacityFallback: Partial<Record<CurrentMapLayerId, number>>
  notifyRuntimeReady: () => void
  notifyRuntimeError: (message: string) => void
  notifyViewChange: (view: RuntimeView, options: RuntimeViewOptions) => void
  setRuntimeLayerState: Dispatch<SetStateAction<Record<string, boolean> | null>>
  setRuntimeLayerOpacityState: Dispatch<SetStateAction<Record<string, number> | null>>
  setViewport: Dispatch<SetStateAction<ViewportState>>
  setGpsPosition: Dispatch<SetStateAction<[number, number] | null>>
}

function resolveMapSpans(mapRef: MutableRefObject<any>) {
  const bounds = mapRef.current?.getMap?.()?.getBounds?.()
  const southWest = bounds?.getSouthWest?.()
  const northEast = bounds?.getNorthEast?.()
  if (!southWest || !northEast) return { span: undefined, latSpan: undefined, lonSpan: undefined }
  const latSpan = Math.abs(Number(northEast.lat) - Number(southWest.lat))
  const lonSpan = Math.abs(Number(northEast.lng) - Number(southWest.lng))
  return {
    span: lonSpan || latSpan || undefined,
    latSpan: latSpan || undefined,
    lonSpan: lonSpan || undefined,
  }
}

function sameLayerState(
  a: Record<string, boolean> | null,
  b: Record<string, boolean>
) {
  if (!a) return false
  const aKeys = Object.keys(b)
  return aKeys.every((key) => a[key] === b[key])
}

function sameOpacityState(
  a: Record<string, number> | null,
  b: Partial<Record<string, number>>
) {
  if (!a) return false
  const keys = Object.keys({ ...a, ...b })
  return keys.every((key) => a[key] === b[key])
}

function sameViewportState(
  a: ViewportState,
  b: ViewportState
) {
  return (
    Math.abs(a.longitude - b.longitude) < 1e-6 &&
    Math.abs(a.latitude - b.latitude) < 1e-6 &&
    Math.abs(a.zoom - b.zoom) < 1e-6
  )
}

export function applyMapLibreRuntimeCommand({
  command,
  mapRef,
  mapLoaded,
  viewport,
  getVisibleLayerIds,
  layerOpacity,
  layerOpacityFallback,
  notifyRuntimeReady,
  notifyRuntimeError,
  notifyViewChange,
  setRuntimeLayerState,
  setRuntimeLayerOpacityState,
  setViewport,
  setGpsPosition,
}: ApplyMapLibreRuntimeCommandArgs): void {
  switch (command.type) {
    case 'runtime:statusRequest': {
      if (mapLoaded) {
        const spans = resolveMapSpans(mapRef)
        notifyRuntimeReady()
        notifyViewChange(
          {
            lat: viewport.latitude,
            lon: viewport.longitude,
            zoom: viewport.zoom,
          },
          {
            span: spans.span,
            latSpan: spans.latSpan,
            lonSpan: spans.lonSpan,
            visibleLayerIds: getVisibleLayerIds(),
            layerOpacity,
          }
        )
      }
      return
    }
    case 'runtime:setLayers': {
      const nextLayerState = toCurrentMapLayerVisibilityMap(command.payload)
      setRuntimeLayerState((prev) => (sameLayerState(prev, nextLayerState) ? prev : nextLayerState))
      return
    }
    case 'runtime:setOpacity': {
      setRuntimeLayerOpacityState((prev) => {
        const next = mergeCurrentMapLayerOpacity(prev ?? layerOpacityFallback, command.payload)
        return sameOpacityState(prev, next) ? prev : next
      })
      return
    }
    case 'runtime:setOverviewLayer': {
      return
    }
    case 'runtime:setView': {
      const payload = command.payload
      if (Array.isArray(payload.visibleLayerIds)) {
        const nextLayerState = toCurrentMapLayerVisibilityMap(payload.visibleLayerIds)
        setRuntimeLayerState((prev) => (sameLayerState(prev, nextLayerState) ? prev : nextLayerState))
      }
      if (payload.layerOpacity && typeof payload.layerOpacity === 'object') {
        setRuntimeLayerOpacityState((prev) => {
          const next = mergeCurrentMapLayerOpacity(prev ?? layerOpacityFallback, payload.layerOpacity)
          return sameOpacityState(prev, next) ? prev : next
        })
      }
      applyMapLibreViewState({
        map: mapRef.current?.getMap?.(),
        view: {
          lat: payload.center.lat,
          lon: payload.center.lon,
          zoom: payload.zoom,
          span: payload.span,
          latSpan: payload.latSpan,
          lonSpan: payload.lonSpan,
        },
        setViewport,
      })
      return
    }
    case 'runtime:zoomIn': {
      const map = mapRef.current?.getMap()
      if (map?.zoomIn) {
        map.zoomIn()
      } else {
        setViewport((prev) => {
          const next = { ...prev, zoom: prev.zoom + 1 }
          return sameViewportState(prev, next) ? prev : next
        })
      }
      return
    }
    case 'runtime:zoomOut': {
      const map = mapRef.current?.getMap()
      if (map?.zoomOut) {
        map.zoomOut()
      } else {
        setViewport((prev) => {
          const next = { ...prev, zoom: prev.zoom - 1 }
          return sameViewportState(prev, next) ? prev : next
        })
      }
      return
    }
    case 'runtime:showLocation': {
      const { lat, lon } = command.payload
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
      setGpsPosition([lat, lon])
      setViewport((prev) => {
        const next = {
          ...prev,
          latitude: lat,
          longitude: lon,
          zoom: Math.max(prev.zoom, 15),
        }
        return sameViewportState(prev, next) ? prev : next
      })
      return
    }
    case 'runtime:locate': {
      if (!navigator.geolocation) return
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          setGpsPosition([latitude, longitude])
          setViewport((prev) => {
            const next = {
              ...prev,
              latitude,
              longitude,
              zoom: Math.max(prev.zoom, 15),
            }
            return sameViewportState(prev, next) ? prev : next
          })
        },
        (error) => {
          notifyRuntimeError(error.message || '現在地の取得に失敗しました')
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 10000,
        }
      )
      return
    }
  }
}
