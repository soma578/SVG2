'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MAP_MESSAGES } from '../../lib/mapMessages'
import type { GeoViewport, LayerState } from './mapTypes'
import { fetchJsonWithRuntimeCache } from './mapData'
import {
  importExternalLayers,
  loadImportedLayers,
  saveImportedLayers,
} from './importedLayers'

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

type LayerCatalog = {
  layers?: Array<{
    id?: string
    label?: string
    visible?: boolean
    disabled?: boolean
    note?: string
    source?: string
    group?: string
    requiresController?: boolean
    experimental?: boolean
  }>
}

export const useRuntimeBridge = ({
  iframeSrc,
  initialLayers,
  resolvedViewport,
}: UseRuntimeBridgeOptions) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [layers, setLayers] = useState<LayerState[]>(initialLayers)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [mapViewport, setMapViewport] = useState<GeoViewport | null>(null)
  const [isOnline, setIsOnline] = useState<boolean | null>(null)

  useEffect(() => {
    setRuntimeReady(false)
  }, [iframeSrc])

  useEffect(() => {
    const imported = loadImportedLayers()
    if (imported.length === 0) return
    setLayers((prev) => {
      const ids = new Set(prev.map((layer) => layer.id))
      return [...prev, ...imported.filter((layer) => !ids.has(layer.id))]
    })
  }, [])

  useEffect(() => {
    let active = true
    fetchJsonWithRuntimeCache<LayerCatalog>('/map/layers/catalog.json')
      .then(({ data }) => {
        if (!active) return
        const catalogLayers = (data.layers ?? [])
          .filter((layer): layer is Required<Pick<LayerState, 'id' | 'label'>> & Partial<LayerState> =>
            typeof layer.id === 'string' && layer.id.length > 0 &&
            typeof layer.label === 'string' && layer.label.length > 0,
          )
          .map((layer) => ({
            id: layer.id,
            label: layer.label,
            visible: Boolean(layer.visible),
            disabled: Boolean(layer.disabled) || undefined,
            note: layer.note,
            source: layer.source,
            group: layer.group,
            requiresController: Boolean(layer.requiresController) || undefined,
            experimental: Boolean(layer.experimental) || undefined,
          }))
        setLayers((prev) => {
          const previousById = new Map(prev.map((layer) => [layer.id, layer]))
          const baseLayers = initialLayers.map((layer) => ({
            ...layer,
            visible: previousById.get(layer.id)?.visible ?? layer.visible,
          }))
          const baseIds = new Set(baseLayers.map((layer) => layer.id))
          const extras = catalogLayers
            .filter((layer) => !baseIds.has(layer.id))
            .map((layer) => ({
              ...layer,
              visible: previousById.get(layer.id)?.visible ?? layer.visible,
            }))
          const knownIds = new Set([...baseLayers, ...extras].map((layer) => layer.id))
          const imported = prev.filter((layer) => layer.imported && !knownIds.has(layer.id))
          return [...baseLayers, ...extras, ...imported]
        })
      })
      .catch((error) => {
        console.warn('[page] layer catalog load failed', error)
      })
    return () => {
      active = false
    }
  }, [initialLayers])

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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const fromMapFrame = event.source === iframeRef.current?.contentWindow
      const sameOrigin = event.origin === window.location.origin
      const message = objectValue(event.data)
      const type = stringValue(message.type)
      if (!type) return
      if (type !== MAP_MESSAGES.runtimeReady) return
      if (!fromMapFrame || !sameOrigin) return

      setRuntimeReady(true)
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const postViewport = useCallback((viewport: GeoViewport) => {
    setMapViewport(viewport)
    if (!iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: MAP_MESSAGES.mapSetViewport,
      viewport,
    }, window.location.origin)
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
    const factor = direction === 'in' ? 0.9 : 1.1111111
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
        const visible = !layer.visible
        return {
          ...layer,
          visible,
          attrs: layer.attrs ? { ...layer.attrs, visibility: visible ? 'visible' : 'hidden' } : undefined,
        }
      })
      const target = next.find((layer) => layer.id === layerId)
      if (target && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: MAP_MESSAGES.mapSetLayerVisible,
          layerKey: layerId,
          visible: target.visible,
        }, window.location.origin)
      }
      saveImportedLayers(next)
      return next
    })
  }, [])

  const addImportedLayers = useCallback(async (input: {
    kind: 'container' | 'layer'
    url: string
    title?: string
  }) => {
    const candidates = await importExternalLayers(input)
    const knownHrefs = new Set(
      layers.filter((layer) => layer.imported).map((layer) => layer.attrs?.['xlink:href']),
    )
    const additions = candidates.filter((layer) => !knownHrefs.has(layer.attrs?.['xlink:href']))
    if (additions.length === 0) throw new Error('同じレイヤーは追加済みです')
    const next = [...layers, ...additions]
    setLayers(next)
    saveImportedLayers(next)
    if (runtimeReady && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: MAP_MESSAGES.mapImportLayers,
        layers: additions,
      }, window.location.origin)
    }
    return additions.length
  }, [layers, runtimeReady])

  const removeImportedLayer = useCallback((layerId: string) => {
    const next = layers.filter((layer) => layer.id !== layerId || !layer.imported)
    setLayers(next)
    saveImportedLayers(next)
    iframeRef.current?.contentWindow?.postMessage({
      type: MAP_MESSAGES.mapRemoveLayer,
      layerId,
    }, window.location.origin)
  }, [layers])

  useEffect(() => {
    if (!runtimeReady || !resolvedViewport || !iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage({
      type: MAP_MESSAGES.mapSetViewport,
      viewport: resolvedViewport,
    }, window.location.origin)
  }, [runtimeReady, resolvedViewport])

  useEffect(() => {
    if (!runtimeReady || !iframeRef.current?.contentWindow) return
    const imported = layers.filter((layer) => layer.imported)
    if (imported.length > 0) {
      iframeRef.current.contentWindow.postMessage({
        type: MAP_MESSAGES.mapImportLayers,
        layers: imported,
      }, window.location.origin)
    }
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
    runtimeReady,
    mapViewport,
    isOnline,
    postViewport,
    postCurrentLocation,
    focusLocation,
    zoomViewport,
    resetViewport,
    toggleLayer,
    addImportedLayers,
    removeImportedLayer,
  }
}
