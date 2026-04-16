/**
 * 地区境界レイヤーの遅延ロードHook
 * ズームレベルとエリアに応じて適切なGeoJSONを動的にロード
 */
import { useState, useEffect, useCallback, useRef } from 'react'

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

const FULL_DISTRICT_METADATA_REGION_IDS = new Set(['okayama', 'okayama-demo'])

function resolveTargetAreaIds(metadata: DistrictMetadata, regionId?: string) {
  const areaIds = Object.keys(metadata.areas)
  if (areaIds.length === 0) return []

  const normalizedRegionId = String(regionId || '').trim()
  if (!normalizedRegionId || FULL_DISTRICT_METADATA_REGION_IDS.has(normalizedRegionId)) {
    return areaIds
  }

  if (metadata.areas[normalizedRegionId]) {
    return [normalizedRegionId]
  }

  return []
}

export function useDistrictLayers(currentZoom: number, enabled: boolean, regionId?: string) {
  const [metadata, setMetadata] = useState<DistrictMetadata | null>(null)
  const [loadedLayers, setLoadedLayers] = useState<Map<string, LoadedLayer>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedLayersRef = useRef(loadedLayers)

  // loadedLayersRef を常に最新の状態に保つ
  useEffect(() => {
    loadedLayersRef.current = loadedLayers
  }, [loadedLayers])

  // デバッグログを削減

  // メタデータの読み込み
  useEffect(() => {
    if (!enabled) return

    fetch('/districts/districts_metadata.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(data => setMetadata(data))
      .catch(err => {
        console.warn('Districts metadata fetch skipped:', err?.message || err)
        setError('メタデータの読み込みに失敗しました')
      })
  }, [enabled])

  // 現在のズームレベルに必要なレイヤーを判定
  const getRequiredLayers = useCallback(() => {
    if (!metadata || currentZoom < 11) return []

    const required: Array<{ areaId: string; zoomLevel: 'high' | 'low'; file: string }> = []
    const targetAreaIds = resolveTargetAreaIds(metadata, regionId)

    for (const areaId of targetAreaIds) {
      const area = metadata.areas[areaId]
      if (!area) continue
      if (currentZoom >= area.high_zoom.min_zoom) {
        // 高ズーム用 (zoom >= 14)
        required.push({
          areaId,
          zoomLevel: 'high',
          file: area.high_zoom.file
        })
      } else if (currentZoom >= area.low_zoom.min_zoom) {
        // 低ズーム用 (11 <= zoom < 14) - max_zoomチェックを削除してギャップを埋める
        required.push({
          areaId,
          zoomLevel: 'low',
          file: area.low_zoom.file
        })
      }
    }

    return required
  }, [metadata, currentZoom, regionId])

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
      const newLayers = new Map(loadedLayersRef.current)

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
    if (loadedLayers.size === 0) return null

    const allFeatures: any[] = []
    for (const layer of Array.from(loadedLayers.values())) {
      if (layer.data && layer.data.features) {
        allFeatures.push(...layer.data.features)
      }
    }

    if (allFeatures.length === 0) return null

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
