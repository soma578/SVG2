import { useEffect, useMemo, useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import {
  currentMapRegionConfig,
  getCurrentMapMunicipalitiesGeoJsonUrl,
  type CurrentMapRegionConfig,
} from '@/lib/currentMapRegion'
import {
  CURRENT_MAP_ATTRIBUTIONS,
  buildDistrictFillLayer,
  buildDistrictOutlineLayer,
  buildDistrictSelectionFillLayer,
  buildDistrictSelectionOutlineLayer,
  buildShelterClusterCountLayer,
  buildShelterClusterLayer,
  buildSheltersLayer,
  buildTeamActivityLayer,
  getSelectedDistrictKeyCode,
  type TeamActivityAreaState,
} from '@/features/map/maplibre/currentMapOverlayLayerStyles'

type Props = {
  activeLayers: Record<string, boolean>
  evacuationLayerVisible: boolean
  teamActivityGeoJSON: any
  boundaryOpacity: number
  shelters: any[]
  districtsGeoJSON: any
  selectedFeatureId?: string
  selectedBaseAreaName?: string | null
  selectedBaseAreaCode?: string | null
  showDistrictBoundaries?: boolean
  layerMinZooms?: {
    municipality: number
    districtDetail: number
    evacuation: number
    teamActivity: number
  }
  viewportZoom?: number
  regionConfig?: CurrentMapRegionConfig
  selectedPrefecture?: string | null
}

export default function MapLibreOverlayLayers({
  activeLayers,
  evacuationLayerVisible,
  teamActivityGeoJSON,
  boundaryOpacity,
  shelters,
  districtsGeoJSON,
  selectedFeatureId,
  selectedBaseAreaName: selectedBaseAreaNameProp,
  selectedBaseAreaCode,
  showDistrictBoundaries = false,
  layerMinZooms = {
    municipality: 0,
    districtDetail: 11,
    evacuation: 0,
    teamActivity: 0,
  },
  viewportZoom = 0,
  regionConfig = currentMapRegionConfig,
  selectedPrefecture,
}: Props) {
  const buildPrefectureCandidates = (value: string) => {
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
    if (normalized === '北海道' || normalized === '北海') candidates.add('北海道')
    return Array.from(candidates)
  }

  const matchesPrefectureName = (value: unknown, candidates: string[]) => {
    const pref = String(value || '').trim()
    if (!pref || candidates.length === 0) return false
    return candidates.includes(pref)
  }

  const normalizeAreaName = (value: string) => value.replace(/\s+/g, '').trim()
  const buildAreaVariants = (rawValue: unknown) => {
    const raw = String(rawValue || '').trim()
    if (!raw) return []

    const variants = new Set<string>([raw, normalizeAreaName(raw)])
    const compact = normalizeAreaName(raw)
    const withoutPref = compact.replace(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/, '')
    if (withoutPref && withoutPref !== compact) variants.add(withoutPref)
    return Array.from(variants)
  }

  const selectedDistrictKeyCode = getSelectedDistrictKeyCode(selectedFeatureId)
  const selectedBaseAreaName = selectedBaseAreaNameProp || null
  const municipalitiesGeoJsonUrl = getCurrentMapMunicipalitiesGeoJsonUrl(regionConfig, viewportZoom)
  const isJapanRegion = regionConfig.regionId === 'japan'
  const regionPrefectureCandidates = useMemo(() => {
    if (isJapanRegion) {
      return buildPrefectureCandidates(selectedPrefecture || '')
    }
    return buildPrefectureCandidates(regionConfig.regionLabel)
  }, [isJapanRegion, regionConfig.regionLabel, selectedPrefecture])
  // マスクの表示条件（県外のベースマップを隠す）
  const shouldShowPrefectureMask = useMemo(() => {
    if (isJapanRegion) return Boolean(selectedPrefecture)
    return regionPrefectureCandidates.length > 0
  }, [isJapanRegion, regionPrefectureCandidates.length, selectedPrefecture])
  // baseAreaソースデータのフィルタ条件（全国GeoJSONから県を抽出する場合のみ）
  const shouldFilterBaseAreaToPrefecture = useMemo(() => {
    if (isJapanRegion) return Boolean(selectedPrefecture)
    return municipalitiesGeoJsonUrl.includes('/data/source/n03_national_light.geojson')
      || municipalitiesGeoJsonUrl.includes('/data/source/national/prefectures-low.geojson')
  }, [isJapanRegion, municipalitiesGeoJsonUrl, selectedPrefecture])
  const [filteredBaseAreaGeoJSON, setFilteredBaseAreaGeoJSON] = useState<any>(null)
  const [prefectureMaskGeoJSON, setPrefectureMaskGeoJSON] = useState<any>(null)
  const [filteredSheltersGeoJSON, setFilteredSheltersGeoJSON] = useState<any>(null)
  const useShelterClustering = regionConfig.regionId === 'japan'
  const shouldFilterSheltersToPrefecture = useShelterClustering && regionPrefectureCandidates.length > 0
  const teamActivityAreaState: TeamActivityAreaState = (() => {
    const buckets = {
      activeAreas: new Set<string>(),
      standbyAreas: new Set<string>(),
      stoppedAreas: new Set<string>(),
    }
    const features = Array.isArray(teamActivityGeoJSON?.features) ? teamActivityGeoJSON.features : []
    for (const feature of features) {
      const props = feature?.properties ?? {}
      const areaVariants = buildAreaVariants(props.area || props.address)
      if (areaVariants.length === 0) continue
      const status = String(props.status || 'unknown')
      const targetBucket =
        status === 'active'
          ? buckets.activeAreas
          : status === 'standby'
            ? buckets.standbyAreas
            : buckets.stoppedAreas
      areaVariants.forEach((variant) => targetBucket.add(variant))
    }
    return {
      activeAreas: Array.from(buckets.activeAreas),
      standbyAreas: Array.from(buckets.standbyAreas),
      stoppedAreas: Array.from(buckets.stoppedAreas),
    }
  })()
  const sheltersSourceData = useShelterClustering
    ? (shouldFilterSheltersToPrefecture && filteredSheltersGeoJSON
        ? filteredSheltersGeoJSON
        : '/data/source/national/shelters-light.geojson')
    : { type: 'FeatureCollection', features: shelters }
  const hasShelterSource = useShelterClustering
    ? (shouldFilterSheltersToPrefecture ? Boolean(filteredSheltersGeoJSON) : true)
    : shelters.length > 0
  const baseAreaSourceData = useMemo(() => {
    if (shouldFilterBaseAreaToPrefecture) {
      return filteredBaseAreaGeoJSON ?? {
        type: 'FeatureCollection',
        features: [],
      }
    }
    return municipalitiesGeoJsonUrl
  }, [filteredBaseAreaGeoJSON, municipalitiesGeoJsonUrl, shouldFilterBaseAreaToPrefecture])

  useEffect(() => {
    if (!shouldFilterBaseAreaToPrefecture || regionPrefectureCandidates.length === 0) {
      setFilteredBaseAreaGeoJSON(null)
      return
    }

    let cancelled = false
    fetch(municipalitiesGeoJsonUrl, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((geojson) => {
        if (cancelled) return
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        setFilteredBaseAreaGeoJSON({
          type: 'FeatureCollection',
          features: features.filter((feature: any) => {
            const pref = String(feature?.properties?.pref || '').trim()
            return matchesPrefectureName(pref, regionPrefectureCandidates)
          }),
        })
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('[MapLibreOverlayLayers] base area fetch skipped:', error?.message || error)
        setFilteredBaseAreaGeoJSON(null)
      })

    return () => {
      cancelled = true
    }
  }, [municipalitiesGeoJsonUrl, regionPrefectureCandidates, shouldFilterBaseAreaToPrefecture])

  useEffect(() => {
    if (!shouldShowPrefectureMask || regionPrefectureCandidates.length === 0) {
      setPrefectureMaskGeoJSON(null)
      return
    }

    let cancelled = false
    fetch('/data/source/national/prefectures-low.geojson', { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((geojson) => {
        if (cancelled) return
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        // 対象県のポリゴンを取得
        const targetFeatures = features.filter((feature: any) => {
          const pref = String(feature?.properties?.pref || '').trim()
          return matchesPrefectureName(pref, regionPrefectureCandidates)
        })
        // 県のポリゴンリングを全て収集
        const holes: number[][][] = []
        for (const feature of targetFeatures) {
          const geom = feature?.geometry
          if (!geom) continue
          if (geom.type === 'Polygon') {
            // 外周リングのみ（穴は無視）
            if (geom.coordinates?.[0]) holes.push(geom.coordinates[0])
          } else if (geom.type === 'MultiPolygon') {
            for (const polygon of geom.coordinates || []) {
              if (polygon?.[0]) holes.push(polygon[0])
            }
          }
        }
        // 世界全体を覆う外周 + 県の形をくり抜き（穴）として設定
        const worldOuter: number[][] = [
          [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90],
        ]
        // GeoJSON Polygon: 外周は反時計回り、穴は時計回り
        // しかし MapLibre は右手ルール(RFC 7946)に従う: 外周=反時計回り、穴=時計回り
        // prefectures-low.geojson のリングが反時計回りなら時計回りに反転する
        const ensureClockwise = (ring: number[][]) => {
          let area = 0
          for (let i = 0; i < ring.length - 1; i++) {
            area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1])
          }
          // area > 0 → 時計回り, area < 0 → 反時計回り
          return area > 0 ? ring : [...ring].reverse()
        }
        const invertedPolygon: number[][][] = [
          worldOuter,
          ...holes.map(ensureClockwise),
        ]
        setPrefectureMaskGeoJSON({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: invertedPolygon,
            },
          }],
        })
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('[MapLibreOverlayLayers] prefecture mask fetch skipped:', error?.message || error)
        setPrefectureMaskGeoJSON(null)
      })

    return () => {
      cancelled = true
    }
  }, [regionPrefectureCandidates, shouldShowPrefectureMask])

  useEffect(() => {
    if (!shouldFilterSheltersToPrefecture) {
      setFilteredSheltersGeoJSON(null)
      return
    }

    let cancelled = false
    fetch('/data/source/national/shelters-light.geojson', { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((geojson) => {
        if (cancelled) return
        const features = Array.isArray(geojson?.features) ? geojson.features : []
        setFilteredSheltersGeoJSON({
          type: 'FeatureCollection',
          features: features.filter((feature: any) => {
            const address = String(feature?.properties?.address || '').trim()
            return regionPrefectureCandidates.some((candidate) => address.includes(candidate))
          }),
        })
      })
      .catch((error) => {
        if (cancelled) return
        console.warn('[MapLibreOverlayLayers] shelters filter fetch skipped:', error?.message || error)
        setFilteredSheltersGeoJSON(null)
      })

    return () => {
      cancelled = true
    }
  }, [regionPrefectureCandidates, shouldFilterSheltersToPrefecture])

  return (
    <>
      {activeLayers.baseArea && selectedBaseAreaCode && (
        <Source
          id="base-area-source"
          type="geojson"
          data={baseAreaSourceData}
          attribution={CURRENT_MAP_ATTRIBUTIONS.baseArea}
        >
          <Layer
            key={selectedBaseAreaCode ? `base-area-fill-s-${selectedBaseAreaCode}` : 'base-area-fill-a'}
            id="base-area-fill"
            type="fill"
            minzoom={layerMinZooms.municipality}
            {...(selectedBaseAreaCode ? { filter: ['==', ['get', 'n03_code'], selectedBaseAreaCode] as any } : {})}
            paint={{
              'fill-color': selectedBaseAreaCode ? '#3b82f6' : (shouldFilterBaseAreaToPrefecture ? '#bfdbfe' : '#93c5fd'),
              'fill-opacity': selectedBaseAreaCode ? 0.25 : (shouldFilterBaseAreaToPrefecture ? 0.28 : 0.06),
            }}
          />
          <Layer
            key={selectedBaseAreaCode ? `base-area-outline-s-${selectedBaseAreaCode}` : 'base-area-outline-a'}
            id="base-area-outline"
            type="line"
            minzoom={layerMinZooms.municipality}
            {...(selectedBaseAreaCode ? { filter: ['==', ['get', 'n03_code'], selectedBaseAreaCode] as any } : {})}
            paint={{
              'line-color': selectedBaseAreaCode ? '#2563eb' : '#3b82f6',
              'line-width': selectedBaseAreaCode ? 2.5 : 1,
              'line-opacity': selectedBaseAreaCode ? 1 : 0.65,
            }}
          />
        </Source>
      )}

      {false && shouldShowPrefectureMask && prefectureMaskGeoJSON && (
        <Source
          id="prefecture-mask-source"
          type="geojson"
          data={prefectureMaskGeoJSON}
        >
          <Layer
            id="prefecture-mask-fill"
            type="fill"
            beforeId="base-area-outline"
            paint={{
              'fill-color': '#f8fafc',
              'fill-opacity': 1,
            }}
          />
        </Source>
      )}

      {evacuationLayerVisible && hasShelterSource && (
        <Source
          id="shelters-source"
          type="geojson"
          data={sheltersSourceData as any}
          cluster={useShelterClustering}
          clusterMaxZoom={11}
          clusterRadius={48}
          attribution={CURRENT_MAP_ATTRIBUTIONS.shelters}
        >
          {useShelterClustering && <Layer {...buildShelterClusterLayer(layerMinZooms.evacuation)} />}
          {useShelterClustering && <Layer {...buildShelterClusterCountLayer(layerMinZooms.evacuation)} />}
          <Layer {...buildSheltersLayer(layerMinZooms.evacuation)} />
        </Source>
      )}

      {activeLayers.teamActivity && teamActivityGeoJSON && (
        <Source
          id="team-activity-source"
          type="geojson"
          data={teamActivityGeoJSON}
          attribution={CURRENT_MAP_ATTRIBUTIONS.teamActivity}
        >
          <Layer {...buildTeamActivityLayer(layerMinZooms.teamActivity)} />
        </Source>
      )}

      {activeLayers.baseArea && showDistrictBoundaries && districtsGeoJSON && (
        <Source
          id="districts-source"
          type="geojson"
          data={districtsGeoJSON}
          attribution={CURRENT_MAP_ATTRIBUTIONS.districts}
        >
          <Layer
            {...buildDistrictFillLayer(layerMinZooms.districtDetail, teamActivityAreaState)}
            {...(selectedBaseAreaCode ? { filter: ['==', ['slice', ['get', 'key_code'], 0, 5], selectedBaseAreaCode] as any } : {})}
          />
          {selectedDistrictKeyCode && (
            <Layer {...buildDistrictSelectionFillLayer(selectedDistrictKeyCode, layerMinZooms.districtDetail)} />
          )}
          <Layer
            {...buildDistrictOutlineLayer(boundaryOpacity, layerMinZooms.districtDetail)}
            {...(selectedBaseAreaCode ? { filter: ['==', ['slice', ['get', 'key_code'], 0, 5], selectedBaseAreaCode] as any } : {})}
          />
          {selectedDistrictKeyCode && (
            <Layer {...buildDistrictSelectionOutlineLayer(selectedDistrictKeyCode, layerMinZooms.districtDetail)} />
          )}
        </Source>
      )}


    </>
  )
}
