import { useState, useEffect, useMemo } from 'react'
import {
  findNearbyFacilities,
  findContainingFeature,
  buildGridIndex,
  type GridIndex
} from '@/lib/riskAnalysis'

export interface RiskInfo {
  lat: number
  lon: number
  districtName?: string
  cityName?: string
  flood?: {
    exists: boolean
    depth?: string
    depthClass?: string
    scenario?: string
  }
  landslide?: {
    exists: boolean
    hazardKind?: string
    level?: string
  }
  tsunami?: {
    exists: boolean
    depthClass?: string
  }
  nearestShelters: Array<{
    name: string
    address: string
    type: string
    distance: number
    walkingTime: number
    lat: number
    lon: number
  }>
  elevation?: number
}

export function useRiskAnalysis() {
  const [shelters, setShelters] = useState<any[]>([])
  const [landslideZones, setLandslideZones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // データの読み込み
  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/okayama_shelters.geojson').then(r => r.json()),
      fetch('/okayama_landslide.geojson').then(r => r.json()),
    ])
      .then(([sheltersData, landslideData]) => {
        console.log('[RiskAnalysis] Data loaded:', {
          shelters: sheltersData.features?.length,
          landslide: landslideData.features?.length
        })
        setShelters(sheltersData.features || [])
        setLandslideZones(landslideData.features || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('[RiskAnalysis] Failed to load data:', err)
        setLoading(false)
      })
  }, [])

  // グリッドインデックスの構築（土砂災害）
  const landslideGridIndex = useMemo(() => {
    if (landslideZones.length === 0) return {}
    console.log('[RiskAnalysis] Building landslide grid index...')
    return buildGridIndex(landslideZones)
  }, [landslideZones])

  // クリック地点のリスク評価
  const analyzeRisk = (
    lat: number,
    lon: number,
    districtsGeoJSON?: any,
    onDebugInfo?: (info: { pipTime: number; shelterSearchTime: number; pipCandidates: number }) => void
  ): RiskInfo | null => {
    if (loading) return null

    const startTime = performance.now()
    const pipStartTime = performance.now()

    // 区画判定
    let districtName: string | undefined
    let cityName: string | undefined

    if (districtsGeoJSON?.features) {
      const containingDistrict = findContainingFeature(lon, lat, districtsGeoJSON.features)
      if (containingDistrict) {
        districtName = containingDistrict.properties?.s_name || containingDistrict.properties?.S_NAME
        const cityFullName = containingDistrict.properties?.city_name || containingDistrict.properties?.CITY_NAME
        cityName = cityFullName
      }
    }

    // 土砂災害判定
    let landslide: RiskInfo['landslide'] = { exists: false }
    const containingLandslide = findContainingFeature(lon, lat, landslideZones, landslideGridIndex)
    if (containingLandslide) {
      landslide = {
        exists: true,
        hazardKind: containingLandslide.properties?.A43_001 || '不明',
        level: containingLandslide.properties?.A43_002 === '1' ? 'warning' : 'special_warning'
      }
    }

    const pipEndTime = performance.now()
    const pipTime = pipEndTime - pipStartTime

    // 浸水判定（現時点ではデータがないのでfalse）
    const flood: RiskInfo['flood'] = { exists: false }

    // 津波判定（岡山は内陸なので該当なし）
    const tsunami: RiskInfo['tsunami'] = { exists: false }

    // 最寄り避難所の検索
    const shelterSearchStartTime = performance.now()
    const nearbyFacilities = findNearbyFacilities(lon, lat, shelters, 3, 10000)
    const nearestShelters = nearbyFacilities.map(facility => ({
      name: facility.feature.properties?.P20_002 || facility.feature.properties?.name || '名称不明',
      address: facility.feature.properties?.P20_003 || facility.feature.properties?.address || '',
      type: facility.feature.properties?.P20_004 || facility.feature.properties?.type || '避難所',
      distance: facility.distance,
      walkingTime: facility.walkingTime,
      lat: facility.feature.geometry.coordinates[1],
      lon: facility.feature.geometry.coordinates[0],
    }))
    const shelterSearchTime = performance.now() - shelterSearchStartTime

    const elapsedTime = performance.now() - startTime
    console.log(`[RiskAnalysis] Analysis completed in ${elapsedTime.toFixed(2)}ms`, {
      district: districtName,
      landslide: landslide.exists,
      shelters: nearestShelters.length,
      pipTime: pipTime.toFixed(2),
      shelterSearchTime: shelterSearchTime.toFixed(2)
    })

    // デバッグ情報を渡す
    if (onDebugInfo) {
      onDebugInfo({
        pipTime,
        shelterSearchTime,
        pipCandidates: landslideGridIndex ? Object.keys(landslideGridIndex).length : 0
      })
    }

    return {
      lat,
      lon,
      districtName,
      cityName,
      flood,
      landslide,
      tsunami,
      nearestShelters,
    }
  }

  return {
    analyzeRisk,
    loading,
    shelters,
    landslideZones
  }
}
