'use client'

import { useCallback, useEffect, type MutableRefObject } from 'react'
import type { CurrentMapFeatureProperties } from './featureTypes'
import type { CurrentMapLayerId } from './layerDefinitions'
import type {
  CurrentMapMapLibreRuntimeCommandMessage,
  CurrentMapMapLibreRuntimeEventMessage,
  CurrentMapRuntimeCommand,
  CurrentMapRuntimeEvent,
} from './runtimeProtocol'

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

type RuntimeEventBridgeArgs = {
  runtimeBridgeId?: string
  onRuntimeReady?: () => void
  onRuntimeError?: (message: string) => void
  onMapMove?: (viewport: {
    lat: number
    lon: number
    zoom: number
    latSpan?: number
    lonSpan?: number
  }) => void
  onSelectedFeatureChange?: (feature: CurrentMapFeatureProperties | null) => void
}

type RuntimeCommandBridgeArgs = {
  runtimeBridgeId?: string
  lastProcessedCommandIdRef: MutableRefObject<number>
  applyRuntimeCommand: (command: CurrentMapRuntimeCommand) => void
}

export function useMapLibreRuntimeEventBridge({
  runtimeBridgeId,
  onRuntimeReady,
  onRuntimeError,
  onMapMove,
  onSelectedFeatureChange,
}: RuntimeEventBridgeArgs) {
  const emitRuntimeEvent = useCallback(
    (event: CurrentMapRuntimeEvent) => {
      if (!runtimeBridgeId || typeof window === 'undefined') return
      const message: CurrentMapMapLibreRuntimeEventMessage = {
        type: 'maplibre-runtime:event',
        bridgeId: runtimeBridgeId,
        event,
      }
      window.postMessage(message, window.location.origin)
    },
    [runtimeBridgeId]
  )

  const notifyRuntimeReady = useCallback(() => {
    onRuntimeReady?.()
    emitRuntimeEvent({ type: 'runtime:ready' })
  }, [emitRuntimeEvent, onRuntimeReady])

  const notifyRuntimeError = useCallback(
    (message: string) => {
      const resolved = message || 'MapLibre runtime error'
      onRuntimeError?.(resolved)
      emitRuntimeEvent({ type: 'runtime:error', payload: { message: resolved } })
    },
    [emitRuntimeEvent, onRuntimeError]
  )

  const notifyViewChange = useCallback(
    (view: RuntimeView, options: RuntimeViewOptions) => {
      onMapMove?.({
        lat: view.lat,
        lon: view.lon,
        zoom: view.zoom,
        latSpan: options.latSpan ?? options.span,
        lonSpan: options.lonSpan ?? options.span,
      })
      emitRuntimeEvent({
        type: 'runtime:viewChange',
        payload: {
          engine: 'maplibre',
          center: { lat: view.lat, lon: view.lon },
          zoom: view.zoom,
          span: options.span,
          latSpan: options.latSpan ?? options.span,
          lonSpan: options.lonSpan ?? options.span,
          visibleLayerIds: options.visibleLayerIds,
          layerOpacity: options.layerOpacity,
        },
      })
    },
    [emitRuntimeEvent, onMapMove]
  )

  const notifySelectedFeatureChange = useCallback(
    (feature: CurrentMapFeatureProperties | null) => {
      onSelectedFeatureChange?.(feature)
      if (!feature) return
      emitRuntimeEvent({
        type: 'runtime:featureSelect',
        payload: {
          engine: 'maplibre',
          feature,
        },
      })
    },
    [emitRuntimeEvent, onSelectedFeatureChange]
  )

  return {
    notifyRuntimeReady,
    notifyRuntimeError,
    notifyViewChange,
    notifySelectedFeatureChange,
  }
}

export function useMapLibreRuntimeCommandBridge({
  runtimeBridgeId,
  lastProcessedCommandIdRef,
  applyRuntimeCommand,
}: RuntimeCommandBridgeArgs) {
  useEffect(() => {
    if (!runtimeBridgeId || typeof window === 'undefined') return

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as Partial<CurrentMapMapLibreRuntimeCommandMessage> | undefined
      if (!data || data.type !== 'maplibre-runtime:command' || data.bridgeId !== runtimeBridgeId) return
      if (!data.envelope || typeof data.envelope.id !== 'number' || !data.envelope.command) return
      if (data.envelope.id <= lastProcessedCommandIdRef.current) return
      applyRuntimeCommand(data.envelope.command)
      lastProcessedCommandIdRef.current = data.envelope.id
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [applyRuntimeCommand, lastProcessedCommandIdRef, runtimeBridgeId])
}
