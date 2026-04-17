/**
 * 地区境界レイヤーの遅延ロードHook
 * ズームレベルとエリアに応じて適切なGeoJSONを動的にロード
 *
 * muni split 対応:
 *   districtIndexByMunicipality が指定されており、かつ selectedMuniCode が
 *   そのインデックスに存在する場合は、市区町村単位の静的 GeoJSON ファイルを
 *   1 本だけ fetch する (新方式)。
 *   それ以外は従来の districts_metadata.json + エリアグループ方式にフォールバック。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { extractMunicipalityCode } from '@/lib/municipalityCode'

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

type FeatureCollection = { type: 'FeatureCollection'; features: any[] }

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

export interface DistrictMuniSplitOptions {
  /** districtIndexByMunicipality from the region manifest. */
  index: Record<string, string> | null | undefined
  /** Currently selected 5-digit municipality code (or longer; first 5 digits are used). */
  selectedMuniCode: string | null | undefined
}

export function useDistrictLayers(
  currentZoom: number,
  enabled: boolean,
  regionId?: string,
  muniSplitOptions?: DistrictMuniSplitOptions
) {
  // ── muni split state ──────────────────────────────────────────────
  const [muniGeoJSON, setMuniGeoJSON] = useState<FeatureCollection | null>(null)
  const [muniLoading, setMuniLoading] = useState(false)
  const lastMuniKeyRef = useRef<string | null>(null)

  // ── legacy (area-group) state ─────────────────────────────────────
  const [metadata, setMetadata] = useState<DistrictMetadata | null>(null)
  const [loadedLayers, setLoadedLayers] = useState<Map<string, LoadedLayer>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedLayersRef = useRef(loadedLayers)

  useEffect(() => {
    loadedLayersRef.current = loadedLayers
  }, [loadedLayers])

  // ── Resolve whether muni split applies ───────────────────────────
  const muniCode = extractMunicipalityCode(muniSplitOptions?.selectedMuniCode)
  const muniPath =
    muniCode && muniSplitOptions?.index
      ? (muniSplitOptions.index[muniCode] ?? null)
      : null

  const useMuniSplit = muniPath !== null

  // Warn when an index exists but the selected municipality isn't covered yet.
  // This means the region has opted in to muni split but the split file for
  // this particular municipality hasn't been generated yet.
  useEffect(() => {
    if (
      enabled &&
      muniCode &&
      muniSplitOptions?.index &&
      Object.keys(muniSplitOptions.index).length > 0 &&
      muniPath === null
    ) {
      console.warn(
        `[useDistrictLayers] districtIndexByMunicipality exists but muniCode "${muniCode}" is not indexed.` +
        ' Falling back to area-group files. Run split-districts-by-muni.mjs to add this municipality.'
      )
    }
  }, [enabled, muniCode, muniSplitOptions?.index, muniPath])

  // ── muni split fetch ─────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !useMuniSplit || !muniPath) return

    if (lastMuniKeyRef.current === muniPath) return
    lastMuniKeyRef.current = muniPath

    let cancelled = false
    setMuniLoading(true)

    fetch(muniPath, { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        console.log('[districts] muni fetch', muniPath, data.features?.length)
        setMuniGeoJSON(data)
        setMuniLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error(`[useDistrictLayers] muni split fetch failed (${muniPath}):`, err)
        setMuniGeoJSON(null)
        setMuniLoading(false)
        lastMuniKeyRef.current = null // allow retry
      })

    return () => {
      cancelled = true
    }
  }, [enabled, useMuniSplit, muniPath])

  // Clear muni cache when the muni changes or split becomes inactive.
  useEffect(() => {
    if (!useMuniSplit) {
      setMuniGeoJSON(null)
      lastMuniKeyRef.current = null
    }
  }, [useMuniSplit])

  // ── legacy: metadata load ─────────────────────────────────────────
  useEffect(() => {
    if (!enabled || useMuniSplit) return

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
  }, [enabled, useMuniSplit])

  // ── legacy: per-area GeoJSON load ────────────────────────────────
  const getRequiredLayers = useCallback(() => {
    if (!metadata || currentZoom < 11) return []

    const required: Array<{ areaId: string; zoomLevel: 'high' | 'low'; file: string }> = []
    const targetAreaIds = resolveTargetAreaIds(metadata, regionId)

    for (const areaId of targetAreaIds) {
      const area = metadata.areas[areaId]
      if (!area) continue
      if (currentZoom >= area.high_zoom.min_zoom) {
        required.push({ areaId, zoomLevel: 'high', file: area.high_zoom.file })
      } else if (currentZoom >= area.low_zoom.min_zoom) {
        required.push({ areaId, zoomLevel: 'low', file: area.low_zoom.file })
      }
    }

    return required
  }, [metadata, currentZoom, regionId])

  useEffect(() => {
    if (!enabled || !metadata || useMuniSplit) return

    const required = getRequiredLayers()
    if (required.length === 0) {
      setLoadedLayers(new Map())
      return
    }

    const loadLayers = async () => {
      setLoading(true)
      const newLayers = new Map(loadedLayersRef.current)

      for (const layer of required) {
        const key = `${layer.areaId}_${layer.zoomLevel}`
        if (newLayers.has(key)) continue

        try {
          console.log(`Loading district layer: ${layer.file}`)
          const response = await fetch(`/districts/${layer.file}`)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          newLayers.set(key, { areaId: layer.areaId, zoomLevel: layer.zoomLevel, data, timestamp: Date.now() })
          console.log(`Loaded: ${layer.file} (${data.features.length} features)`)
        } catch (err) {
          console.error(`Failed to load ${layer.file}:`, err)
          setError(`${layer.file}の読み込みに失敗しました`)
        }
      }

      const requiredKeys = new Set(required.map(r => `${r.areaId}_${r.zoomLevel}`))
      for (const key of Array.from(newLayers.keys())) {
        if (!requiredKeys.has(key)) {
          newLayers.delete(key)
        }
      }

      setLoadedLayers(newLayers)
      setLoading(false)
    }

    loadLayers()
  }, [enabled, metadata, currentZoom, getRequiredLayers, useMuniSplit])

  // ── Combine and return ───────────────────────────────────────────
  const getCombinedGeoJSON = useCallback((): FeatureCollection | null => {
    if (loadedLayers.size === 0) return null
    const allFeatures: any[] = []
    for (const layer of Array.from(loadedLayers.values())) {
      if (layer.data?.features) allFeatures.push(...layer.data.features)
    }
    return allFeatures.length > 0 ? { type: 'FeatureCollection', features: allFeatures } : null
  }, [loadedLayers])

  if (useMuniSplit) {
    return {
      geojson: muniGeoJSON,
      loading: muniLoading,
      error: null,
      loadedCount: muniGeoJSON ? 1 : 0,
      featureCount: muniGeoJSON?.features.length ?? 0,
    }
  }

  return {
    geojson: getCombinedGeoJSON(),
    loading,
    error,
    loadedCount: loadedLayers.size,
    featureCount: getCombinedGeoJSON()?.features.length || 0,
  }
}
