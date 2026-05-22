'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAP_MESSAGES } from '../../lib/mapMessages'
import type { DataStatusEntry, FeatureDetailModel, GeoViewport, LayerState, RuntimeDataSource } from './mapTypes'

const DATA_STATUS_LABELS: Record<string, string> = {
  runtimeConfig: '地域設定',
  evacuation: '避難所',
  evacuationHitRecords: '避難所検索',
  teamActivity: '活動情報',
  baseArea: '地域境界',
  districtSvg: '地区境界',
}

const objectValue = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

const stringValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

type UseRuntimeBridgeOptions = {
  iframeSrc: string
  initialLayers: LayerState[]
  resolvedViewport: GeoViewport | null
}

export const useRuntimeBridge = ({
  iframeSrc,
  initialLayers,
  resolvedViewport,
}: UseRuntimeBridgeOptions) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [layers, setLayers] = useState<LayerState[]>(initialLayers)
  const [featureDetail, setFeatureDetail] = useState<FeatureDetailModel | null>(null)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [mapViewport, setMapViewport] = useState<GeoViewport | null>(null)
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [dataStatuses, setDataStatuses] = useState<Record<string, DataStatusEntry>>({})

  useEffect(() => {
    setRuntimeReady(false)
  }, [iframeSrc])

  useEffect(() => {
    if (resolvedViewport) setMapViewport(resolvedViewport)
  }, [resolvedViewport])

  useEffect(() => {
    const syncOnline = () => setIsOnline(navigator.onLine)
    syncOnline()
    window.addEventListener('online', syncOnline)
    window.addEventListener('offline', syncOnline)
    return () => {
      window.removeEventListener('online', syncOnline)
      window.removeEventListener('offline', syncOnline)
    }
  }, [])

  const updateDataStatus = useCallback((entry: Partial<DataStatusEntry> & { key: string }) => {
    setDataStatuses((prev) => {
      const label = entry.label || DATA_STATUS_LABELS[entry.key] || entry.key
      return {
        ...prev,
        [entry.key]: {
          key: entry.key,
          label,
          source: entry.source || prev[entry.key]?.source || 'fallback',
          url: entry.url ?? prev[entry.key]?.url,
          online: entry.online ?? (typeof navigator !== 'undefined' ? navigator.onLine : undefined),
          updatedAt: entry.updatedAt || new Date().toISOString(),
          message: entry.message,
        },
      }
    })
  }, [])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const fromMapFrame = event.source === iframeRef.current?.contentWindow
      const sameOrigin = event.origin === window.location.origin
      const message = objectValue(event.data)
      const type = stringValue(message.type)
      if (!type) return
      const runtimeMessage =
        type === MAP_MESSAGES.runtimeReady ||
        type === MAP_MESSAGES.runtimeDataStatus ||
        type === MAP_MESSAGES.runtimeFeatureDetail
      if (!runtimeMessage) return
      if (!fromMapFrame || !sameOrigin) return

      if (type === MAP_MESSAGES.runtimeReady) {
        setRuntimeReady(true)
        const payload = objectValue(message.payload)
        const runtimeConfigUrl = stringValue(payload.runtimeConfigUrl)
        if (runtimeConfigUrl) {
          updateDataStatus({
            key: 'runtimeConfig',
            source: 'network',
            url: runtimeConfigUrl,
            online: navigator.onLine,
          })
        }
        return
      }

      if (type === MAP_MESSAGES.runtimeFeatureDetail) {
        const payload = objectValue(message.payload)
        const detailRaw = objectValue(payload.detail)
        const id = stringValue(detailRaw.id)
        const title = stringValue(detailRaw.title)
        if (!id || !title) return

        setFeatureDetail({ ...detailRaw, id, title } as FeatureDetailModel)
        return
      }

      if (type === MAP_MESSAGES.runtimeDataStatus) {
        const payload = objectValue(message.payload)
        const key = stringValue(payload.key)
        if (!key) return
        updateDataStatus({
          key,
          label: stringValue(payload.label),
          source: (stringValue(payload.source) as RuntimeDataSource | undefined) || 'fallback',
          url: stringValue(payload.url),
          online: typeof payload.online === 'boolean' ? payload.online : undefined,
          updatedAt: stringValue(payload.updatedAt) || stringValue(payload.at) || new Date().toISOString(),
          message: stringValue(payload.message),
        })
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [updateDataStatus])

  const postViewport = useCallback((viewport: GeoViewport) => {
    setMapViewport(viewport)
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: MAP_MESSAGES.mapSetViewport,
      viewport,
    }, window.location.origin)
  }, [])

  const clearFeatureDetail = useCallback(() => {
    setFeatureDetail(null)
  }, [])

  const postCurrentLocation = useCallback((lat: number, lon: number) => {
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: MAP_MESSAGES.mapSetCurrentLocation,
      location: { lat, lon },
    }, window.location.origin)
  }, [])

  const focusLocation = useCallback((viewport: GeoViewport) => {
    setMapViewport(viewport)
    iframeRef.current?.contentWindow?.postMessage(
      { type: MAP_MESSAGES.mapFocusLocation, location: viewport },
      window.location.origin,
    )
  }, [])

  const zoomViewport = useCallback((direction: 'in' | 'out') => {
    const factor = direction === 'in' ? 0.72 : 1.3888889
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      { type: MAP_MESSAGES.mapZoom, factor },
      window.location.origin,
    )
  }, [])

  const resetViewport = useCallback(() => {
    if (!resolvedViewport) return
    postViewport(resolvedViewport)
    iframeRef.current?.contentWindow?.postMessage({ type: MAP_MESSAGES.mapResetView }, window.location.origin)
  }, [postViewport, resolvedViewport])

  const toggleLayer = useCallback((layerId: string) => {
    setLayers((prev) => {
      const next = prev.map((layer) => {
        if (layer.id !== layerId || layer.disabled) return layer
        return { ...layer, visible: !layer.visible }
      })
      const target = next.find((layer) => layer.id === layerId)
      if (target && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: MAP_MESSAGES.mapSetLayerVisible,
          layerKey: layerId,
          visible: target.visible,
        }, window.location.origin)
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!runtimeReady || !resolvedViewport || !iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: MAP_MESSAGES.mapSetViewport,
      viewport: resolvedViewport,
    }, window.location.origin)
  }, [runtimeReady, resolvedViewport])

  useEffect(() => {
    if (!runtimeReady || !iframeRef.current?.contentWindow) return
    layers.forEach((layer) => {
      if (layer.disabled) return
      iframeRef.current?.contentWindow?.postMessage({
        type: MAP_MESSAGES.mapSetLayerVisible,
        layerKey: layer.id,
        visible: layer.visible,
      }, window.location.origin)
    })
  }, [layers, runtimeReady])

  return {
    iframeRef,
    layers,
    featureDetail,
    runtimeReady,
    mapViewport,
    isOnline,
    dataStatuses,
    clearFeatureDetail,
    postViewport,
    postCurrentLocation,
    focusLocation,
    zoomViewport,
    resetViewport,
    toggleLayer,
  }
}
