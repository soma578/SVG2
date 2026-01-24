/**
 * 地区境界レイヤーの遅延ロードHook
 * ズームレベルとエリアに応じて適切なGeoJSONを動的にロード
 */
import { useState, useEffect, useCallback } from 'react'

interface DistrictMetadata {
  areas: Record<string, {
    name: string
    high_zoom: {
      file: string
      min_zoom: number
      features: number
    }
    low_zoom: {
      file: string
      min_zoom: number
      max_zoom: number
      features: number
    }
  }>
}

interface LoadedLayer {
  areaId: string
  zoomLevel: 'high' | 'low'
  data: any
  timestamp: number
}

export function useDistrictLayers(currentZoom: number, enabled: boolean) {
  const [metadata, setMetadata] = useState<DistrictMetadata | null>(null)
  const [loadedLayers, setLoadedLayers] = useState<Map<string, LoadedLayer>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  console.log('[useDistrictLayers] Hook called:', {
    currentZoom,
    enabled,
    hasMetadata: !!metadata,
    loadedLayersSize: loadedLayers.size,
    loading
  })

  // メタデータの読み込み
  useEffect(() => {
    if (!enabled) return

    fetch('/districts/districts_metadata.json')
      .then(res => res.json())
      .then(data => setMetadata(data))
      .catch(err => {
        console.error('Failed to load districts metadata:', err)
        setError('メタデータの読み込みに失敗しました')
      })
  }, [enabled])

  // 現在のズームレベルに必要なレイヤーを判定
  const getRequiredLayers = useCallback(() => {
    if (!metadata || currentZoom < 11) return []

    const required: Array<{ areaId: string; zoomLevel: 'high' | 'low'; file: string }> = []

    for (const [areaId, area] of Object.entries(metadata.areas)) {
      if (currentZoom >= area.high_zoom.min_zoom) {
        // 高ズーム用
        required.push({
          areaId,
          zoomLevel: 'high',
          file: area.high_zoom.file
        })
      } else if (currentZoom >= area.low_zoom.min_zoom && currentZoom <= area.low_zoom.max_zoom) {
        // 低ズーム用
        required.push({
          areaId,
          zoomLevel: 'low',
          file: area.low_zoom.file
        })
      }
    }

    return required
  }, [metadata, currentZoom])

  // レイヤーの動的ロード
  useEffect(() => {
    if (!enabled || !metadata) return

    const required = getRequiredLayers()
    if (required.length === 0) {
      // ズームレベルが低い場合はクリア
      setLoadedLayers(new Map())
      return
    }

    const loadLayers = async () => {
      setLoading(true)
      const newLayers = new Map(loadedLayers)

      for (const layer of required) {
        const key = `${layer.areaId}_${layer.zoomLevel}`

        // すでにロード済みならスキップ
        if (newLayers.has(key)) continue

        try {
          console.log(`Loading district layer: ${layer.file}`)
          const response = await fetch(`/districts/${layer.file}`)

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const data = await response.json()

          newLayers.set(key, {
            areaId: layer.areaId,
            zoomLevel: layer.zoomLevel,
            data,
            timestamp: Date.now()
          })

          console.log(`Loaded: ${layer.file} (${data.features.length} features)`)
        } catch (err) {
          console.error(`Failed to load ${layer.file}:`, err)
          setError(`${layer.file}の読み込みに失敗しました`)
        }
      }

      // 不要になったレイヤーを削除（メモリ節約）
      const requiredKeys = new Set(required.map(r => `${r.areaId}_${r.zoomLevel}`))
      for (const key of Array.from(newLayers.keys())) {
        if (!requiredKeys.has(key)) {
          console.log(`Unloading layer: ${key}`)
          newLayers.delete(key)
        }
      }

      setLoadedLayers(newLayers)
      setLoading(false)
    }

    loadLayers()
  }, [enabled, metadata, currentZoom, getRequiredLayers])

  // 現在表示すべきGeoJSONを結合して返す
  const getCombinedGeoJSON = useCallback(() => {
    console.log('[useDistrictLayers] getCombinedGeoJSON called:', {
      loadedLayersSize: loadedLayers.size,
      loadedLayersKeys: Array.from(loadedLayers.keys())
    })

    if (loadedLayers.size === 0) {
      console.log('[useDistrictLayers] No loaded layers, returning null')
      return null
    }

    const allFeatures: any[] = []

    for (const layer of Array.from(loadedLayers.values())) {
      if (layer.data && layer.data.features) {
        console.log('[useDistrictLayers] Adding features from layer:', layer.areaId, layer.data.features.length)
        allFeatures.push(...layer.data.features)
      }
    }

    if (allFeatures.length === 0) {
      console.log('[useDistrictLayers] No features collected, returning null')
      return null
    }

    console.log('[useDistrictLayers] Returning GeoJSON with', allFeatures.length, 'features')
    return {
      type: 'FeatureCollection' as const,
      features: allFeatures
    }
  }, [loadedLayers])

  return {
    geojson: getCombinedGeoJSON(),
    loading,
    error,
    loadedCount: loadedLayers.size,
    featureCount: getCombinedGeoJSON()?.features.length || 0
  }
}
