'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import LayerPanel from '@/components/map/LayerPanel'
import ShareButton from '@/components/map/ShareButton'
import PropertySheet from '@/features/map/ui/PropertySheet'
import { buildSearchResultSelection } from '@/features/map/ui/searchResultSelection'
import { buildCurrentMapBootstrapState } from '@/app/map/currentMapBootstrap'
import {
  createCurrentMapViewportTarget,
  type CurrentMapViewportTarget,
} from '@/app/map/currentMapTargets'
import {
  currentMapRegionConfig,
  getCurrentMapDisplayTitle,
  loadCurrentMapRegionIndex,
  loadCurrentMapRegionConfig,
  resolveCurrentMapRegionId,
  type CurrentMapRegionConfig,
  type CurrentMapRegionListEntry,
} from '@/lib/currentMapRegion'
import {
  getCurrentMapRegionIdFromURL,
  loadStateFromURL,
  saveStateToURLWithRegion,
  type MapState,
} from '@/lib/urlState'
import { loadRuntimeConfig } from '@/features/map/engine/runtimeConfig'
import type { RuntimeConfig } from '@/features/map/engine/runtimeConfig'
import { FALLBACK_MAP_VIEW } from '@/features/map/engine/defaultMapView'
import {
  currentMapDefaultLayerOpacity,
  sanitizeCurrentMapLayerOpacity,
} from '@/features/map/engine/layerOpacity'
import type { CurrentMapFeatureProperties } from '@/features/map/engine/featureTypes'
import type { SearchResult } from '@/components/map/SearchBox'
import type { CurrentMapRuntimeCommand } from '@/features/map/engine/runtimeProtocol'
import {
  currentMapDefaultLayers,
  currentMapLayerIds,
  getLayerPanelLayerIds,
} from '@/lib/currentMapLayers'

const SvgMapEmbed = dynamic(() => import('@/components/map/SvgMapEmbed'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-[#f5f1ea]" />,
})

const MapLibreHost = dynamic(() => import('@/components/map/MapLibreHost'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
})

const MapLibreOverviewMap = dynamic(() => import('@/components/map/MapLibreOverviewMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-white" />,
})

type MapViewport = {
  lat: number
  lon: number
  zoom: number
  latSpan: number
  lonSpan: number
}

type MapViewportConstraint = {
  minZoom?: number
  maxBounds?: [[number, number], [number, number]]
}

type EngineOverviewState = {
  overviewLevel: 'nation' | 'prefecture' | 'detail'
  selectedOverviewPrefecture: string | null
  selectedDetailViewportConstraint?: MapViewportConstraint
}

type JapanOverviewIndex = {
  prefectures: Array<{
    pref: string
    teamActivityCount: number
    lat: number
    lon: number
    latSpan: number
    lonSpan: number
    zoom: number
  }>
  municipalities: Array<{
    pref: string
    teamActivityCount: number
  }>
}

export default function MapPage() {
  const defaultViewport = useMemo<MapViewport>(() => ({
    lat: FALLBACK_MAP_VIEW.center.lat,
    lon: FALLBACK_MAP_VIEW.center.lon,
    zoom: FALLBACK_MAP_VIEW.zoom,
    latSpan: FALLBACK_MAP_VIEW.latSpan,
    lonSpan: FALLBACK_MAP_VIEW.lonSpan,
  }), [])
  const scheduleMapPageStateUpdate = useCallback((fn: () => void) => {
    if (typeof window === 'undefined') {
      fn()
      return
    }
    window.setTimeout(fn, 0)
  }, [])

  const [mapEngine, setMapEngine] = useState<'svgmap' | 'maplibre'>('svgmap')
  const [resolvedRegionConfig, setResolvedRegionConfig] = useState<CurrentMapRegionConfig>(currentMapRegionConfig)
  const [availableRegions, setAvailableRegions] = useState<CurrentMapRegionListEntry[]>([])
  const [regionNotice, setRegionNotice] = useState<string | null>(null)
  const [resolvedRuntimeConfig, setResolvedRuntimeConfig] = useState<RuntimeConfig | null>(null)
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(currentMapDefaultLayers)
  const [showSettings, setShowSettings] = useState(true)
  const [layerOpacity, setLayerOpacity] = useState<Record<string, number>>(currentMapDefaultLayerOpacity)
  const [mapViewport, setMapViewport] = useState<MapViewport>(defaultViewport)
  const [searchTarget, setSearchTarget] = useState<CurrentMapViewportTarget | null>(null)
  const [svgLocateTarget, setSvgLocateTarget] = useState<CurrentMapViewportTarget | null>(null)
  const [selectedFeature, setSelectedFeatureRaw] = useState<CurrentMapFeatureProperties | null>(null)
  const [selectedMunicipalityName, setSelectedMunicipalityName] = useState<string | null>(null)
  const [selectedMunicipalityCode, setSelectedMunicipalityCode] = useState<string | null>(null)
  const [showDistrictBoundaries, setShowDistrictBoundaries] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number
    lon: number
    accuracy?: number
  } | null>(null)
  const selectionLockRef = useRef(0)
  const setSelectedFeature = useCallback((feature: CurrentMapFeatureProperties | null) => {
    if (feature) {
      selectionLockRef.current = Date.now()
      setSelectedFeatureRaw(feature)
    } else if (Date.now() - selectionLockRef.current > 500) {
      setSelectedFeatureRaw(null)
    }
  }, [])
  const closeSelectedFeature = useCallback(() => {
    selectionLockRef.current = 0
    setSelectedFeatureRaw(null)
  }, [])
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [svgControlCommand, setSvgControlCommand] = useState<{ token: number; command: CurrentMapRuntimeCommand } | null>(null)
  const [mapLibreControlCommand, setMapLibreControlCommand] = useState<{ token: number; command: CurrentMapRuntimeCommand } | null>(null)
  const [svgRuntimeReloadToken, setSvgRuntimeReloadToken] = useState(0)
  const [mapLibreRuntimeReloadToken, setMapLibreRuntimeReloadToken] = useState(0)
  const [initialized, setInitialized] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configReloadToken, setConfigReloadToken] = useState(0)
  const pendingOverviewOverrideRef = useRef<{ overviewLevel: 'nation' | 'prefecture' | 'detail'; prefecture: string | null; viewport?: MapViewport } | null>(null)
  const lastProcessedConfigTokenRef = useRef(-1)
  const [overviewLevel, setOverviewLevel] = useState<'nation' | 'prefecture' | 'detail'>('detail')
  const [selectedOverviewPrefecture, setSelectedOverviewPrefecture] = useState<string | null>(null)
  const [selectedDetailViewportConstraint, setSelectedDetailViewportConstraint] = useState<MapViewportConstraint | undefined>(undefined)
  const [engineOverviewStates, setEngineOverviewStates] = useState<Record<'svgmap' | 'maplibre', EngineOverviewState>>({
    svgmap: {
      overviewLevel: 'detail',
      selectedOverviewPrefecture: null,
      selectedDetailViewportConstraint: undefined,
    },
    maplibre: {
      overviewLevel: 'detail',
      selectedOverviewPrefecture: null,
      selectedDetailViewportConstraint: undefined,
    },
  })
  const [nationOverviewViewport, setNationOverviewViewport] = useState(defaultViewport)
  const [prefectureOverviewViewports, setPrefectureOverviewViewports] = useState<Record<string, MapViewport>>({})
  const [japanOverviewIndex, setJapanOverviewIndex] = useState<JapanOverviewIndex | null>(null)
  const [regionDataSummary, setRegionDataSummary] = useState<{
    shelterCount: number
    teamActivityCount: number
  } | null>(null)
  const [dataSourceStatus, setDataSourceStatus] = useState<{
    shelter: { source: string; fetchedAt: string | null }
    teamActivity: { source: string; fetchedAt: string | null }
  } | null>(null)
  const currentMapTitle = useMemo(
    () => getCurrentMapDisplayTitle(resolvedRegionConfig),
    [resolvedRegionConfig]
  )

  const formatGeolocationError = useCallback((error: GeolocationPositionError) => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'ブラウザの位置情報アクセスが拒否されました。サイトの位置情報許可をオンにしてください。'
      case error.POSITION_UNAVAILABLE:
        return '現在地を取得できませんでした。GPSやネットワークの状態を確認してください。'
      case error.TIMEOUT:
        return '現在地の取得がタイムアウトしました。少し待ってから再試行してください。'
      default:
        return error.message || '現在地の取得に失敗しました。'
    }
  }, [])

  // URL から状態を復元（初回のみ）
  useEffect(() => {
    if (initialized && configReloadToken === lastProcessedConfigTokenRef.current) return
    let cancelled = false

    ;(async () => {
      setConfigLoading(true)
      setConfigError(null)
      try {
        const requestedRegionId = getCurrentMapRegionIdFromURL() ?? currentMapRegionConfig.regionId
        const regionIndex = await loadCurrentMapRegionIndex()
        if (cancelled) return
        setAvailableRegions(regionIndex)
        const regionId = resolveCurrentMapRegionId(requestedRegionId, regionIndex)
        const regionConfig = await loadCurrentMapRegionConfig(regionId)
        if (cancelled) return
        const runtimeConfig = await loadRuntimeConfig(regionConfig)
        if (cancelled) return
        setResolvedRegionConfig(regionConfig)
        setResolvedRuntimeConfig(runtimeConfig)
        setRegionNotice(
          requestedRegionId !== regionId
            ? `region=${requestedRegionId} は未登録のため、${regionConfig.regionLabel}を表示しています。`
            : null
        )

        const bootstrapState = buildCurrentMapBootstrapState({
          runtimeConfig,
          savedState: loadStateFromURL(),
        })
        const forceJapanOverview = regionConfig.regionId === 'japan'
        const initialMapEngine = forceJapanOverview ? 'maplibre' : bootstrapState.mapEngine
        const initialLayers = forceJapanOverview
          ? {
              ...bootstrapState.activeLayers,
              baseArea: true,
              evacuation: false,
              teamActivity: false,
            }
          : bootstrapState.activeLayers
        const initialViewport = forceJapanOverview
          ? {
              lat: runtimeConfig.initialView.center.lat,
              lon: runtimeConfig.initialView.center.lon,
              zoom: runtimeConfig.initialView.zoom,
              latSpan: runtimeConfig.initialView.span ?? bootstrapState.mapViewport.latSpan,
              lonSpan: runtimeConfig.initialView.span ?? bootstrapState.mapViewport.lonSpan,
            }
          : bootstrapState.mapViewport

        setMapEngine(initialMapEngine)
        setActiveLayers(initialLayers)
        setLayerOpacity(bootstrapState.layerOpacity)
        if (forceJapanOverview) {
          setNationOverviewViewport(initialViewport)
        }
        const override = pendingOverviewOverrideRef.current
        pendingOverviewOverrideRef.current = null
        setMapViewport(override?.viewport ?? initialViewport)
        const nextOverviewLevel = override ? override.overviewLevel : (forceJapanOverview ? 'nation' : 'detail')
        const nextPrefecture = override ? override.prefecture : null
        setOverviewLevel(nextOverviewLevel)
        setSelectedOverviewPrefecture(nextPrefecture)
        setSelectedDetailViewportConstraint(undefined)
        setEngineOverviewStates({
          svgmap: {
            overviewLevel: nextOverviewLevel,
            selectedOverviewPrefecture: nextPrefecture,
            selectedDetailViewportConstraint: undefined,
          },
          maplibre: {
            overviewLevel: nextOverviewLevel,
            selectedOverviewPrefecture: nextPrefecture,
            selectedDetailViewportConstraint: undefined,
          },
        })
        lastProcessedConfigTokenRef.current = configReloadToken
        setInitialized(true)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'runtime-config の読み込みに失敗しました'
        setConfigError(message)
        setResolvedRuntimeConfig(null)
        setInitialized(false)
      } finally {
        if (!cancelled) setConfigLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [configReloadToken, initialized])

  useEffect(() => {
    let cancelled = false
    fetch('/search-index/japan-hierarchical-overview.json', { cache: 'force-cache' })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setJapanOverviewIndex(payload)
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[map page] Failed to load japan overview index:', error)
          setJapanOverviewIndex(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (resolvedRegionConfig.regionId === 'japan') {
      setRegionDataSummary(null)
      return
    }
    let cancelled = false
    const regionId = resolvedRegionConfig.regionId
    const shelterUrl = new URL('/api/shelters', window.location.origin)
    shelterUrl.searchParams.set('region', regionId)
    const teamUrl = new URL('/api/team-activity', window.location.origin)
    teamUrl.searchParams.set('region', regionId)
    Promise.all([
      fetch(shelterUrl).then((r) => r.ok ? r.json() : []),
      fetch(teamUrl).then((r) => r.ok ? r.json() : []),
    ])
      .then(([shelters, teams]) => {
        if (!cancelled) {
          setRegionDataSummary({
            shelterCount: Array.isArray(shelters) ? shelters.length : 0,
            teamActivityCount: Array.isArray(teams) ? teams.length : 0,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setRegionDataSummary(null)
      })
    return () => { cancelled = true }
  }, [resolvedRegionConfig.regionId])

  useEffect(() => {
    setEngineOverviewStates((prev) => {
      const current = prev[mapEngine]
      const sameConstraint =
        JSON.stringify(current.selectedDetailViewportConstraint ?? null) ===
        JSON.stringify(selectedDetailViewportConstraint ?? null)

      if (
        current.overviewLevel === overviewLevel &&
        current.selectedOverviewPrefecture === selectedOverviewPrefecture &&
        sameConstraint
      ) {
        return prev
      }

      return {
        ...prev,
        [mapEngine]: {
          overviewLevel,
          selectedOverviewPrefecture,
          selectedDetailViewportConstraint,
        },
      }
    })
  }, [mapEngine, overviewLevel, selectedDetailViewportConstraint, selectedOverviewPrefecture])

  const handleLayerToggle = (layerId: string) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }))
  }

  const handleMapEngineChange = useCallback((nextEngine: 'svgmap' | 'maplibre') => {
    if (nextEngine === mapEngine) return

    if (resolvedRegionConfig.regionId === 'japan') {
      const nextOverviewState = engineOverviewStates[nextEngine]
      setOverviewLevel(nextOverviewState.overviewLevel)
      setSelectedOverviewPrefecture(nextOverviewState.selectedOverviewPrefecture)
      setSelectedDetailViewportConstraint(nextOverviewState.selectedDetailViewportConstraint)

      if (nextOverviewState.overviewLevel === 'nation') {
        setMapViewport(nationOverviewViewport)
      } else if (nextOverviewState.overviewLevel === 'prefecture' && nextOverviewState.selectedOverviewPrefecture) {
        const savedViewport = prefectureOverviewViewports[nextOverviewState.selectedOverviewPrefecture]
        if (savedViewport) {
          setMapViewport(savedViewport)
        }
      }
    }

    setMapEngine(nextEngine)
  }, [engineOverviewStates, mapEngine, nationOverviewViewport, prefectureOverviewViewports, resolvedRegionConfig.regionId])

  const handleRegionChange = useCallback((nextRegionId: string) => {
    if (typeof window === 'undefined') return
    const normalizedRegionId = nextRegionId.trim()
    if (!normalizedRegionId || normalizedRegionId === resolvedRegionConfig.regionId) return

    const url = new URL(window.location.href)
    url.searchParams.set('region', normalizedRegionId)
    url.searchParams.delete('s')
    window.history.replaceState({}, '', url.toString())

    setInitialized(false)
    setSelectedFeatureRaw(null)
    setSearchTarget(null)
    setSvgLocateTarget(null)
    setCurrentLocation(null)
    setRuntimeError(null)
    setRegionNotice(null)
    const nextOverviewLevel = normalizedRegionId === 'japan' ? 'nation' : 'detail'
    setOverviewLevel(nextOverviewLevel)
    setSelectedOverviewPrefecture(null)
    setSelectedDetailViewportConstraint(undefined)
    setEngineOverviewStates({
      svgmap: {
        overviewLevel: nextOverviewLevel,
        selectedOverviewPrefecture: null,
        selectedDetailViewportConstraint: undefined,
      },
      maplibre: {
        overviewLevel: nextOverviewLevel,
        selectedOverviewPrefecture: null,
        selectedDetailViewportConstraint: undefined,
      },
    })
    if (normalizedRegionId === 'japan') {
      setMapViewport(nationOverviewViewport)
    }
    setConfigReloadToken((prev) => prev + 1)
  }, [nationOverviewViewport, resolvedRegionConfig.regionId])

  const transitionToRegionDetail = useCallback((params: {
    regionId: string
    lat: number
    lon: number
    zoom?: number
    latSpan?: number
    lonSpan?: number
  }) => {
    if (typeof window === 'undefined') return

    const detailActiveLayers: Record<string, boolean> = {
      ...activeLayers,
      baseArea: true,
      evacuation: true,
      teamActivity: true,
    }

    const nextState: MapState = {
      engine: 'maplibre',
      center: {
        lat: params.lat,
        lon: params.lon,
      },
      zoom: Number.isFinite(params.zoom) ? Number(params.zoom) : 11,
      span: Number.isFinite(params.lonSpan) ? Number(params.lonSpan) : Number.isFinite(params.latSpan) ? Number(params.latSpan) : undefined,
      latSpan: Number.isFinite(params.latSpan) ? Number(params.latSpan) : undefined,
      lonSpan: Number.isFinite(params.lonSpan) ? Number(params.lonSpan) : undefined,
      visibleLayerIds: currentMapLayerIds.filter((layerId) => Boolean(detailActiveLayers[layerId])),
      layerOpacity: sanitizeCurrentMapLayerOpacity(layerOpacity),
    }

    saveStateToURLWithRegion(nextState, params.regionId)
    setActiveLayers(detailActiveLayers)
    setInitialized(false)
    setSelectedFeatureRaw(null)
    setSearchTarget(null)
    setSvgLocateTarget(null)
    setCurrentLocation(null)
    setRuntimeError(null)
    setRegionNotice(null)
    setConfigReloadToken((prev) => prev + 1)
  }, [activeLayers, layerOpacity])

  const handleMapMove = useCallback((viewport: {
    lat: number
    lon: number
    zoom: number
    latSpan?: number
    lonSpan?: number
  }) => {
    setMapViewport((prev) => {
      const nextLatSpan = viewport.latSpan ?? prev.latSpan
      const nextLonSpan = viewport.lonSpan ?? prev.lonSpan
      const sameViewport =
        Math.abs(prev.lat - viewport.lat) < 1e-6 &&
        Math.abs(prev.lon - viewport.lon) < 1e-6 &&
        Math.abs(prev.zoom - viewport.zoom) < 1e-6 &&
        Math.abs(prev.latSpan - nextLatSpan) < 1e-6 &&
        Math.abs(prev.lonSpan - nextLonSpan) < 1e-6

      if (sameViewport) return prev

      return {
        lat: viewport.lat,
        lon: viewport.lon,
        zoom: viewport.zoom,
        latSpan: nextLatSpan,
        lonSpan: nextLonSpan,
      }
    })
    setSearchTarget((prev) => {
      if (!prev) return null
      const sameCenter = Math.abs(prev.lat - viewport.lat) < 1e-6 && Math.abs(prev.lon - viewport.lon) < 1e-6
      const sameZoom = Math.abs(prev.zoom - viewport.zoom) < 1e-6
      const sameLatSpan =
        prev.latSpan == null || viewport.latSpan == null ? true : Math.abs(prev.latSpan - viewport.latSpan) < 1e-6
      const sameLonSpan =
        prev.lonSpan == null || viewport.lonSpan == null ? true : Math.abs(prev.lonSpan - viewport.lonSpan) < 1e-6
      return sameCenter && sameZoom && sameLatSpan && sameLonSpan ? null : prev
    })
    setSvgLocateTarget((prev) => {
      if (!prev) return null
      const sameCenter = Math.abs(prev.lat - viewport.lat) < 1e-6 && Math.abs(prev.lon - viewport.lon) < 1e-6
      const sameZoom = Math.abs(prev.zoom - viewport.zoom) < 1e-6
      const sameLatSpan =
        prev.latSpan == null || viewport.latSpan == null ? true : Math.abs(prev.latSpan - viewport.latSpan) < 1e-6
      const sameLonSpan =
        prev.lonSpan == null || viewport.lonSpan == null ? true : Math.abs(prev.lonSpan - viewport.lonSpan) < 1e-6
      return sameCenter && sameZoom && sameLatSpan && sameLonSpan ? null : prev
    })
  }, [])

  const handleSelectedFeatureChange = useCallback((feature: CurrentMapFeatureProperties | null) => {
    if (feature?.category === 'baseArea') return
    setSelectedFeature(feature)
  }, [setSelectedFeature])

  const handleSearchResultSelect = (result: SearchResult) => {
    const zoom = result.zoom ?? (result.type === 'district' ? 15 : 16)
    const latSpan =
      typeof result.latSpan === 'number'
        ? result.latSpan
        : zoom >= 16
          ? 0.015
          : result.type === 'district'
            ? 0.08
            : 0.04
    const lonSpan =
      typeof result.lonSpan === 'number'
        ? result.lonSpan
        : zoom >= 16
          ? 0.015
          : result.type === 'district'
            ? 0.08
            : 0.04
    const { feature } = buildSearchResultSelection(result)

    if (result.layerId) {
      setActiveLayers((prev) => ({
        ...prev,
        [result.layerId as string]: true,
      }))
    }

    setSelectedFeature(feature)
    setShowDistrictBoundaries(result.type === 'district')
    if (resolvedRegionConfig.regionId === 'japan') {
      setOverviewLevel('detail')
      setSelectedDetailViewportConstraint(undefined)
    }
    setSearchTarget(createCurrentMapViewportTarget({
      lat: result.lat,
      lon: result.lon,
      zoom,
      latSpan,
      lonSpan,
    }))
  }
  const showHierarchicalOverview = resolvedRegionConfig.regionId === 'japan' && overviewLevel !== 'detail'

  const rememberOverviewViewport = useCallback((viewport: MapViewport) => {
    if (overviewLevel === 'nation') {
      setNationOverviewViewport(viewport)
      return
    }
    if (selectedOverviewPrefecture) {
      setPrefectureOverviewViewports((prev) => ({
        ...prev,
        [selectedOverviewPrefecture]: viewport,
      }))
    }
  }, [overviewLevel, selectedOverviewPrefecture])

  const issueCommonMapCommand = useCallback((command: CurrentMapRuntimeCommand) => {
    if (mapEngine === 'maplibre') {
      setMapLibreControlCommand({
        token: Date.now(),
        command,
      })
      return
    }
    setSvgControlCommand({
      token: Date.now(),
      command,
    })
  }, [mapEngine])

  const handleZoomIn = useCallback(() => {
    if (showHierarchicalOverview) {
      setMapViewport((prev) => {
        const nextViewport = {
          ...prev,
          zoom: Math.min(prev.zoom + 0.8, 12),
        }
        rememberOverviewViewport(nextViewport)
        return nextViewport
      })
      return
    }
    issueCommonMapCommand({ type: 'runtime:zoomIn' })
  }, [issueCommonMapCommand, rememberOverviewViewport, showHierarchicalOverview])

  const handleZoomOut = useCallback(() => {
    if (showHierarchicalOverview) {
      setMapViewport((prev) => {
        const nextViewport = {
          ...prev,
          zoom: Math.max(prev.zoom - 0.8, 4),
        }
        rememberOverviewViewport(nextViewport)
        return nextViewport
      })
      return
    }
    issueCommonMapCommand({ type: 'runtime:zoomOut' })
  }, [issueCommonMapCommand, rememberOverviewViewport, showHierarchicalOverview])

  const handleLocate = useCallback(() => {
    setSearchTarget(null)
    setSvgLocateTarget(null)
    closeSelectedFeature()

    if (showHierarchicalOverview) {
      if (!navigator.geolocation) {
        setRuntimeError('このブラウザでは位置情報が利用できません。')
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setRuntimeError(null)
          const { latitude, longitude } = pos.coords
          setMapViewport((prev) => {
            const nextViewport = {
              ...prev,
              lat: latitude,
              lon: longitude,
              zoom: Math.max(prev.zoom, 8.5),
            }
            rememberOverviewViewport(nextViewport)
            return nextViewport
          })
        },
        (error) => {
          setRuntimeError(formatGeolocationError(error))
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
      )
      return
    }

    if (mapEngine === 'maplibre') {
      issueCommonMapCommand({ type: 'runtime:locate' })
      return
    }

    // svgmap: parent-driven geolocation (iframe geolocation is unreliable)
    if (!navigator.geolocation) {
      setRuntimeError('このブラウザでは位置情報が利用できません。')
      return
    }

    const applyPosition = (pos: GeolocationPosition) => {
      setRuntimeError(null)
      const { latitude, longitude, accuracy } = pos.coords
      const locateLatSpan = 0.018
      const locateLonSpan = 0.018
      setCurrentLocation({
        lat: latitude,
        lon: longitude,
        accuracy,
      })
      setSvgLocateTarget(createCurrentMapViewportTarget({
        lat: latitude,
        lon: longitude,
        zoom: Math.max(mapViewport.zoom, 16),
        latSpan: locateLatSpan,
        lonSpan: locateLonSpan,
      }))
      setMapViewport((prev) => ({
        lat: latitude,
        lon: longitude,
        zoom: Math.max(prev.zoom, 16),
        latSpan: locateLatSpan,
        lonSpan: locateLonSpan,
      }))
      setSvgControlCommand({
        token: Date.now(),
        command: {
          type: 'runtime:showLocation',
          payload: { lat: latitude, lon: longitude, accuracy },
        },
      })
    }

    const fallbackToBalancedAccuracy = () => {
      navigator.geolocation.getCurrentPosition(
        applyPosition,
        (error) => {
          console.warn('[map] Geolocation error:', {
            code: error.code,
            message: error.message,
          })
          setRuntimeError(formatGeolocationError(error))
        },
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
      )
    }

    navigator.geolocation.getCurrentPosition(
      applyPosition,
      (error) => {
        if (
          error.code === error.TIMEOUT ||
          error.code === error.POSITION_UNAVAILABLE
        ) {
          fallbackToBalancedAccuracy()
          return
        }
        console.warn('[map] Geolocation error:', {
          code: error.code,
          message: error.message,
        })
        setRuntimeError(formatGeolocationError(error))
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    )
  }, [closeSelectedFeature, formatGeolocationError, issueCommonMapCommand, mapEngine, mapViewport.zoom, rememberOverviewViewport, showHierarchicalOverview])

  const selectedFeatureId = selectedFeature?.id
  const selectedBaseAreaName = selectedMunicipalityName
  const selectedBaseAreaCode = selectedMunicipalityCode
    || (selectedFeature?.category === 'baseArea' ? selectedFeature.title : null)

  // 現在の地図状態
  const currentMapState: MapState = useMemo(() => ({
    engine: mapEngine,
    center: {
      lat: mapViewport.lat,
      lon: mapViewport.lon,
    },
    zoom: mapViewport.zoom,
    span: mapViewport.lonSpan ?? mapViewport.latSpan,
    latSpan: mapViewport.latSpan,
    lonSpan: mapViewport.lonSpan,
    visibleLayerIds: currentMapLayerIds.filter((layerId) => Boolean(activeLayers[layerId])),
    layerOpacity: sanitizeCurrentMapLayerOpacity(layerOpacity),
    selectedFeatureId,
  }), [
    activeLayers,
    layerOpacity,
    mapEngine,
    mapViewport.lat,
    mapViewport.latSpan,
    mapViewport.lon,
    mapViewport.lonSpan,
    mapViewport.zoom,
    selectedFeatureId,
  ])

  const layerPanelLayerIds = useMemo(() => getLayerPanelLayerIds(mapEngine), [mapEngine])
  const hierarchyBadge = useMemo(() => {
    if (resolvedRegionConfig.regionId !== 'japan') return null
    if (overviewLevel === 'nation') return '全国'
    if (overviewLevel === 'prefecture') {
      return `全国 > ${selectedOverviewPrefecture ?? '都道府県'}`
    }
    if (selectedOverviewPrefecture) {
      return `全国 > ${selectedOverviewPrefecture} > 詳細`
    }
    return '全国 > 詳細'
  }, [overviewLevel, resolvedRegionConfig.regionId, selectedOverviewPrefecture])
  const selectedPrefectureViewport = useMemo(() => {
    if (!selectedOverviewPrefecture) return null
    return prefectureOverviewViewports[selectedOverviewPrefecture] ?? null
  }, [prefectureOverviewViewports, selectedOverviewPrefecture])
  const currentRegionPrefectureViewport = useMemo(() => {
    if (resolvedRegionConfig.regionId === 'japan') return selectedPrefectureViewport
    const prefLabel = `${resolvedRegionConfig.regionLabel}`.trim()
    if (!prefLabel || !japanOverviewIndex) return null
    const candidates = new Set<string>([prefLabel])
    if (prefLabel === '北海道' || prefLabel === '北海') {
      candidates.add('北海道')
    } else if (/(都|道|府|県)$/.test(prefLabel)) {
      candidates.add(prefLabel.replace(/(都|道|府|県)$/, ''))
    } else {
      candidates.add(`${prefLabel}県`)
      if (prefLabel === '東京') candidates.add('東京都')
      if (prefLabel === '京都') candidates.add('京都府')
      if (prefLabel === '大阪') candidates.add('大阪府')
    }
    return japanOverviewIndex.prefectures.find((entry) => candidates.has(entry.pref)) ?? null
  }, [japanOverviewIndex, resolvedRegionConfig.regionId, resolvedRegionConfig.regionLabel, selectedPrefectureViewport])
  const runtimeConfigBoundsConstraint = useMemo<MapViewportConstraint | undefined>(() => {
    const bounds = resolvedRuntimeConfig?.maxBounds
    if (!bounds || !Array.isArray(bounds) || bounds.length !== 2) return undefined
    const [[west, south], [east, north]] = bounds
    if ([west, south, east, north].some((v) => !Number.isFinite(v))) return undefined
    return {
      minZoom: Math.max((resolvedRuntimeConfig?.initialView?.zoom ?? 7) - 2, 4),
      maxBounds: [[west, south], [east, north]],
    }
  }, [resolvedRuntimeConfig])

  const detailViewportConstraint = useMemo(() => {
    if (resolvedRegionConfig.regionId !== 'japan') {
      if (runtimeConfigBoundsConstraint) return runtimeConfigBoundsConstraint
      if (!currentRegionPrefectureViewport) return undefined
      const latPadding = Math.max(currentRegionPrefectureViewport.latSpan * 0.55, 0.18)
      const lonPadding = Math.max(currentRegionPrefectureViewport.lonSpan * 0.55, 0.18)
      return {
        minZoom: Math.max(currentRegionPrefectureViewport.zoom - 0.5, 6),
        maxBounds: [
          [currentRegionPrefectureViewport.lon - lonPadding, currentRegionPrefectureViewport.lat - latPadding],
          [currentRegionPrefectureViewport.lon + lonPadding, currentRegionPrefectureViewport.lat + latPadding],
        ] as [[number, number], [number, number]],
      }
    }
    if (!selectedPrefectureViewport) {
      return runtimeConfigBoundsConstraint
    }
    const latPadding = Math.max(selectedPrefectureViewport.latSpan * 0.55, 0.18)
    const lonPadding = Math.max(selectedPrefectureViewport.lonSpan * 0.55, 0.18)
    return {
      minZoom: Math.max(selectedPrefectureViewport.zoom - 0.5, 6),
      maxBounds: [
        [selectedPrefectureViewport.lon - lonPadding, selectedPrefectureViewport.lat - latPadding],
        [selectedPrefectureViewport.lon + lonPadding, selectedPrefectureViewport.lat + latPadding],
      ] as [[number, number], [number, number]],
    }
  }, [currentRegionPrefectureViewport, resolvedRegionConfig.regionId, runtimeConfigBoundsConstraint, selectedPrefectureViewport])
  const detailBasemapBounds = useMemo(() => {
    if (!detailViewportConstraint?.maxBounds) return undefined
    const [[west, south], [east, north]] = detailViewportConstraint.maxBounds
    return [west, south, east, north] as [number, number, number, number]
  }, [detailViewportConstraint])
  const selectedPrefectureSummary = useMemo(() => {
    if (!japanOverviewIndex || !selectedOverviewPrefecture) return null
    const prefecture = japanOverviewIndex.prefectures.find((entry) => entry.pref === selectedOverviewPrefecture)
    const municipalities = japanOverviewIndex.municipalities.filter((entry) => entry.pref === selectedOverviewPrefecture)
    const activeMunicipalityCount = municipalities.filter((entry) => entry.teamActivityCount > 0).length
    return {
      teamActivityCount: prefecture?.teamActivityCount ?? 0,
      municipalityCount: municipalities.length,
      activeMunicipalityCount,
    }
  }, [japanOverviewIndex, selectedOverviewPrefecture])
  const detailContextTitle = useMemo(() => {
    if (selectedFeature?.category === 'baseArea' && selectedFeature.title) return selectedFeature.title
    return selectedOverviewPrefecture ? `${selectedOverviewPrefecture} 詳細` : '詳細マップ'
  }, [selectedFeature, selectedOverviewPrefecture])
  const svgDetailBasemapEnabled = useMemo(() => {
    if (resolvedRegionConfig.regionId !== 'japan') return true
    return overviewLevel === 'detail'
  }, [overviewLevel, resolvedRegionConfig.regionId])
  const restorePrefectureOverviewViewport = useCallback((prefecture: string) => {
    const savedPrefectureViewport = prefectureOverviewViewports[prefecture]
    if (savedPrefectureViewport) {
      setMapViewport(savedPrefectureViewport)
      return
    }

    const prefEntry = japanOverviewIndex?.prefectures.find((entry) => entry.pref === prefecture)
    if (!prefEntry) return

    setMapViewport((prev) => ({
      lat: prefEntry.lat,
      lon: prefEntry.lon,
      zoom: Number.isFinite(prefEntry.zoom) ? prefEntry.zoom : 7,
      latSpan: Number.isFinite(prefEntry.latSpan) ? prefEntry.latSpan : prev.latSpan,
      lonSpan: Number.isFinite(prefEntry.lonSpan) ? prefEntry.lonSpan : prev.lonSpan,
    }))
  }, [japanOverviewIndex, prefectureOverviewViewports])

  const goToNationOverview = useCallback(() => {
    const nextViewport = (
      Number.isFinite(nationOverviewViewport.lat) &&
      Number.isFinite(nationOverviewViewport.lon) &&
      Number.isFinite(nationOverviewViewport.zoom)
    )
      ? nationOverviewViewport
      : defaultViewport

    setMapViewport(nextViewport)
    setSelectedFeatureRaw(null)
    setSelectedMunicipalityName(null)
    setSelectedMunicipalityCode(null)
    setSearchTarget(null)
    setSvgLocateTarget(null)
    setRuntimeError(null)
    setSelectedOverviewPrefecture(null)
    setSelectedDetailViewportConstraint(undefined)
    setOverviewLevel('nation')
  }, [defaultViewport, nationOverviewViewport])

  const handleOverviewBack = useCallback(() => {
    if (overviewLevel === 'prefecture') {
      goToNationOverview()
      return
    }
    if (overviewLevel === 'detail' && selectedOverviewPrefecture) {
      restorePrefectureOverviewViewport(selectedOverviewPrefecture)
      setOverviewLevel('prefecture')
      setSelectedDetailViewportConstraint(undefined)
      setSelectedFeatureRaw(null)
      setSelectedMunicipalityName(null)
      setSelectedMunicipalityCode(null)
      setSearchTarget(null)
    }
  }, [goToNationOverview, overviewLevel, restorePrefectureOverviewViewport, selectedOverviewPrefecture])

  const goToMunicipalitySelection = useCallback(() => {
    if (typeof window === 'undefined') return
    const prefLabel = resolvedRegionConfig.regionLabel
    const prefName = /[都道府県]$/.test(prefLabel) ? prefLabel : `${prefLabel}県`

    const url = new URL(window.location.href)
    url.searchParams.set('region', 'japan')
    url.searchParams.delete('s')
    window.history.replaceState({}, '', url.toString())

    const savedViewport = prefectureOverviewViewports[prefName]
    const prefEntry = japanOverviewIndex?.prefectures?.find((entry) => entry.pref === prefName)
    const prefViewport = savedViewport ?? (prefEntry ? {
      lat: prefEntry.lat,
      lon: prefEntry.lon,
      zoom: Number.isFinite(prefEntry.zoom) ? prefEntry.zoom : 7,
      latSpan: Number.isFinite(prefEntry.latSpan) ? prefEntry.latSpan : mapViewport.latSpan,
      lonSpan: Number.isFinite(prefEntry.lonSpan) ? prefEntry.lonSpan : mapViewport.lonSpan,
    } : undefined)
    pendingOverviewOverrideRef.current = { overviewLevel: 'prefecture', prefecture: prefName, viewport: prefViewport }
    setInitialized(false)
    setSelectedFeatureRaw(null)
    setSelectedMunicipalityName(null)
    setSelectedMunicipalityCode(null)
    setSearchTarget(null)
    setSvgLocateTarget(null)
    setCurrentLocation(null)
    setRuntimeError(null)
    setRegionNotice(null)
    setConfigReloadToken((prev) => prev + 1)
  }, [japanOverviewIndex, mapViewport.latSpan, mapViewport.lonSpan, prefectureOverviewViewports, resolvedRegionConfig.regionLabel])

  const handleOverviewViewportChange = useCallback((viewport: {
    lat: number
    lon: number
    zoom: number
  }) => {
    const nextViewport = {
      lat: viewport.lat,
      lon: viewport.lon,
      zoom: viewport.zoom,
      latSpan: mapViewport.latSpan,
      lonSpan: mapViewport.lonSpan,
    }
    setMapViewport((prev) => ({
      ...prev,
      lat: viewport.lat,
      lon: viewport.lon,
      zoom: viewport.zoom,
    }))
    rememberOverviewViewport(nextViewport)
  }, [mapViewport.latSpan, mapViewport.lonSpan, rememberOverviewViewport])

  return (
    <div className="h-screen flex relative">
      {configLoading && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-white">
          <div className="rounded-lg border border-gray-200 bg-white px-5 py-4 text-sm text-gray-700 shadow">
            設定を読み込み中です...
          </div>
        </div>
      )}

      {!configLoading && configError && (
        <div className="absolute inset-0 z-[80] flex items-center justify-center bg-white p-4">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-red-700">設定の読み込みに失敗しました</h2>
            <p className="mb-4 break-words text-sm text-gray-700">{configError}</p>
            <button
              type="button"
              onClick={() => {
                setConfigReloadToken((prev) => prev + 1)
              }}
              className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-white transition-colors hover:bg-red-700"
            >
              再試行
            </button>
          </div>
        </div>
      )}

      {configLoading || configError ? null : (
        <>
      {showSettings && (
        <aside className="w-80 bg-white border-r border-gray-200 shadow-lg overflow-y-auto flex-shrink-0 z-30">
          <div className="p-6">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">
                  {currentMapTitle}
                </h1>
                <p className="text-sm text-gray-600">
                  {mapEngine === 'svgmap' ? 'SVGMap版' : 'MapLibre版'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setShowSettings(false)}
                className="text-gray-500 hover:text-gray-800 border border-gray-200 rounded-full p-2 bg-gray-50"
                title="Close settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                地図エンジン
              </h2>
              <div className="inline-flex w-full rounded-lg border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => handleMapEngineChange('svgmap')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    mapEngine === 'svgmap'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  SVGMap
                </button>
                <button
                  type="button"
                  onClick={() => handleMapEngineChange('maplibre')}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    mapEngine === 'maplibre'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  MapLibre
                </button>
              </div>
              {mapEngine === 'maplibre' && (
                <p className="mt-2 text-xs text-gray-600">
                  {resolvedRegionConfig.appDescription}
                </p>
              )}
            </div>

            <LayerPanel
              layers={activeLayers}
              onToggle={handleLayerToggle}
              layerIds={layerPanelLayerIds}
              layerOpacity={layerOpacity}
              onLayerOpacityChange={setLayerOpacity}
              onSearchResultSelect={handleSearchResultSelect}
              regionConfig={resolvedRegionConfig}
              contextPanel={
                resolvedRegionConfig.regionId === 'japan' &&
                overviewLevel === 'detail' &&
                selectedOverviewPrefecture ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <button type="button" onClick={goToNationOverview} className="hover:text-blue-600 transition font-medium">全国</button>
                      <span>/</span>
                      <button type="button" onClick={() => {
                        restorePrefectureOverviewViewport(selectedOverviewPrefecture)
                        setSelectedFeatureRaw(null)
                        setSelectedMunicipalityName(null)
                        setSelectedMunicipalityCode(null)
                        setSearchTarget(null)
                        setOverviewLevel('prefecture')
                      }} className="hover:text-blue-600 transition font-medium">{selectedOverviewPrefecture}</button>
                      <span>/</span>
                      <span className="font-semibold text-slate-700">詳細</span>
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-900">{detailContextTitle}</div>
                    <div className="mt-1 text-sm text-slate-600">{selectedOverviewPrefecture} 内の詳細レイヤを表示中</div>
                    {selectedPrefectureSummary && (
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">
                          L3 拠点 {selectedPrefectureSummary.teamActivityCount} 件
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 font-medium text-slate-700">
                          活動あり {selectedPrefectureSummary.activeMunicipalityCount} / {selectedPrefectureSummary.municipalityCount} 市区町村
                        </span>
                      </div>
                    )}
                    {dataSourceStatus && (dataSourceStatus.shelter.source !== 'none' || dataSourceStatus.teamActivity.source !== 'none') && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                        {dataSourceStatus.shelter.source !== 'none' && (
                          <span>
                            避難所: {dataSourceStatus.shelter.source === 'network' ? '最新' : dataSourceStatus.shelter.source === 'cache' ? 'キャッシュ' : dataSourceStatus.shelter.source === 'fallback' ? '初期データ' : '読込中…'}
                          </span>
                        )}
                        {dataSourceStatus.teamActivity.source !== 'none' && (
                          <span>
                            活動: {dataSourceStatus.teamActivity.source === 'network' ? '最新' : dataSourceStatus.teamActivity.source === 'cache' ? 'キャッシュ' : dataSourceStatus.teamActivity.source === 'fallback' ? '初期データ' : '読込中…'}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            restorePrefectureOverviewViewport(selectedOverviewPrefecture)
                            setSelectedFeatureRaw(null)
                            setSelectedMunicipalityName(null)
                            setSelectedMunicipalityCode(null)
                            setSearchTarget(null)
                            setOverviewLevel('prefecture')
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          市区町村を選ぶ
                        </button>
                        <button
                          type="button"
                          onClick={goToNationOverview}
                          className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          県を選ぶ
                        </button>
                      </div>
                    </div>
                  </div>
                ) : resolvedRegionConfig.regionId !== 'japan' ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">{resolvedRegionConfig.regionLabel}</span>
                      {selectedMunicipalityName && (
                        <>
                          <span>/</span>
                          <span className="font-semibold text-slate-700">{selectedMunicipalityName}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-lg font-bold text-slate-900">{selectedMunicipalityName || resolvedRegionConfig.regionLabel}</div>
                    <div className="mt-1 text-sm text-slate-600">詳細レイヤを表示中</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      {regionDataSummary ? (
                        <>
                          <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                            L2 避難所 {regionDataSummary.shelterCount} 件
                          </span>
                          <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">
                            L3 拠点 {regionDataSummary.teamActivityCount} 件
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">データ件数を取得中…</span>
                      )}
                    </div>
                    {dataSourceStatus && (dataSourceStatus.shelter.source !== 'none' || dataSourceStatus.teamActivity.source !== 'none') && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                        {dataSourceStatus.shelter.source !== 'none' && (
                          <span>
                            避難所: {dataSourceStatus.shelter.source === 'network' ? '最新' : dataSourceStatus.shelter.source === 'cache' ? 'キャッシュ' : dataSourceStatus.shelter.source === 'fallback' ? '初期データ' : '読込中…'}
                            {dataSourceStatus.shelter.fetchedAt && (
                              <span className="ml-1 text-slate-400">
                                ({new Date(dataSourceStatus.shelter.fetchedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            )}
                          </span>
                        )}
                        {dataSourceStatus.teamActivity.source !== 'none' && (
                          <span>
                            活動: {dataSourceStatus.teamActivity.source === 'network' ? '最新' : dataSourceStatus.teamActivity.source === 'cache' ? 'キャッシュ' : dataSourceStatus.teamActivity.source === 'fallback' ? '初期データ' : '読込中…'}
                            {dataSourceStatus.teamActivity.fetchedAt && (
                              <span className="ml-1 text-slate-400">
                                ({new Date(dataSourceStatus.teamActivity.fetchedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleRegionChange('japan')}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        県を選ぶ
                      </button>
                      <button
                        type="button"
                        onClick={goToMunicipalitySelection}
                        className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        市を選ぶ
                      </button>
                    </div>
                  </div>
                ) : null
              }
            />

            <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                使い方
              </h3>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• レイヤーをON/OFFして情報を切り替え</li>
                <li>• マップをドラッグで移動、ホイールでズーム</li>
                <li>• 右側のボタンでズーム・現在地</li>
              </ul>
            </div>
          </div>
        </aside>
      )}

      <div className="flex-1 relative z-0">
        {initialized && showHierarchicalOverview ? (
          <MapLibreOverviewMap
            key={`${overviewLevel}:${selectedOverviewPrefecture ?? 'nation'}`}
            level={overviewLevel === 'nation' ? 'nation' : 'prefecture'}
            selectedPrefecture={selectedOverviewPrefecture}
            initialViewport={{
              lat: mapViewport.lat,
              lon: mapViewport.lon,
              zoom: mapViewport.zoom,
            }}
            onViewportChange={handleOverviewViewportChange}
            onSelectPrefecture={(selection) => {
              setSelectedOverviewPrefecture(selection.pref)
              setOverviewLevel('prefecture')
              setSelectedDetailViewportConstraint(undefined)
              setSelectedFeatureRaw(null)
              setSearchTarget(null)
              const savedPrefectureViewport = prefectureOverviewViewports[selection.pref]
              if (savedPrefectureViewport) {
                setMapViewport(savedPrefectureViewport)
                return
              }
              setMapViewport((prev) => ({
                lat: selection.lat,
                lon: selection.lon,
                zoom: Number.isFinite(selection.zoom) ? Number(selection.zoom) : Math.max(prev.zoom, 6.8),
                latSpan: Number.isFinite(selection.latSpan) ? Number(selection.latSpan) : prev.latSpan,
                lonSpan: Number.isFinite(selection.lonSpan) ? Number(selection.lonSpan) : prev.lonSpan,
              }))
            }}
            onSelectMunicipality={(selection) => {
              const shortPref = selection.pref.replace(/(都|道|府|県)$/, '')
              const prefRegion = availableRegions.find(
                (r) => r.regionLabel === shortPref || r.regionLabel === selection.pref
              )
              if (prefRegion && prefRegion.regionId !== 'japan') {
                setSelectedMunicipalityName(selection.name)
                setSelectedMunicipalityCode(selection.n03Code)
                transitionToRegionDetail({
                  regionId: prefRegion.regionId,
                  lat: selection.lat,
                  lon: selection.lon,
                  zoom: Number.isFinite(selection.zoom) ? Number(selection.zoom) : 11,
                  latSpan: Number.isFinite(selection.latSpan) ? Number(selection.latSpan) : 0.12,
                  lonSpan: Number.isFinite(selection.lonSpan) ? Number(selection.lonSpan) : 0.12,
                })
                return
              }

              setSelectedOverviewPrefecture(selection.pref)
              setOverviewLevel('detail')
              setSelectedDetailViewportConstraint({
                minZoom: Math.max((Number.isFinite(selection.zoom) ? Number(selection.zoom) : 11) - 1.8, 7.8),
                maxBounds: [
                  [
                    selection.lon - Math.max((Number.isFinite(selection.lonSpan) ? Number(selection.lonSpan) : 0.12) * 1.35, 0.08),
                    selection.lat - Math.max((Number.isFinite(selection.latSpan) ? Number(selection.latSpan) : 0.12) * 1.35, 0.06),
                  ],
                  [
                    selection.lon + Math.max((Number.isFinite(selection.lonSpan) ? Number(selection.lonSpan) : 0.12) * 1.35, 0.08),
                    selection.lat + Math.max((Number.isFinite(selection.latSpan) ? Number(selection.latSpan) : 0.12) * 1.35, 0.06),
                  ],
                ],
              })
              setSelectedFeatureRaw(null)
              setSelectedMunicipalityName(selection.name)
              setSelectedMunicipalityCode(selection.n03Code)
              setActiveLayers((prev) => ({
                ...prev,
                baseArea: true,
              }))
              setSearchTarget(createCurrentMapViewportTarget({
                lat: selection.lat,
                lon: selection.lon,
                zoom: Number.isFinite(selection.zoom) ? Number(selection.zoom) : 11,
                latSpan: Number.isFinite(selection.latSpan) ? Number(selection.latSpan) : 0.12,
                lonSpan: Number.isFinite(selection.lonSpan) ? Number(selection.lonSpan) : 0.12,
              }))
            }}
          />
        ) : initialized && mapEngine === 'svgmap' ? (
          <SvgMapEmbed
            activeLayers={activeLayers}
            layerOpacity={layerOpacity}
            detailBasemapEnabled={svgDetailBasemapEnabled}
            viewportConstraint={selectedDetailViewportConstraint}
            regionConfig={resolvedRegionConfig}
            highlightTarget={svgLocateTarget ?? searchTarget ?? undefined}
            selectedFeatureId={selectedFeatureId}
            initialViewport={mapViewport}
            viewport={mapViewport}
            currentLocation={currentLocation}
            controlCommand={svgControlCommand}
            reloadToken={svgRuntimeReloadToken}
            onMapMove={handleMapMove}
            onSelectedFeatureChange={handleSelectedFeatureChange}
            onRuntimeReady={() => {
              scheduleMapPageStateUpdate(() => {
                setRuntimeError(null)
              })
            }}
            onRuntimeError={(message) => {
              scheduleMapPageStateUpdate(() => {
                setRuntimeError(message || 'Runtime の初期化に失敗しました')
              })
            }}
          />
        ) : initialized ? (
          <MapLibreHost
            activeLayers={activeLayers}
            showSidebar={showSettings}
            layerOpacity={layerOpacity}
            regionConfig={resolvedRegionConfig}
            selectedPrefecture={selectedOverviewPrefecture}
            runtimeConfig={resolvedRuntimeConfig}
            initialViewport={mapViewport}
            viewportConstraint={detailViewportConstraint ?? selectedDetailViewportConstraint}
            basemapBounds={detailBasemapBounds}
            currentMapState={currentMapState}
            highlightTarget={searchTarget ?? undefined}
            selectedFeatureId={selectedFeatureId}
            selectedBaseAreaName={selectedBaseAreaName}
            selectedBaseAreaCode={selectedBaseAreaCode}
            showDistrictBoundaries={showDistrictBoundaries}
            controlCommand={mapLibreControlCommand}
            reloadToken={mapLibreRuntimeReloadToken}
            onMapMove={handleMapMove}
            onSelectedFeatureChange={handleSelectedFeatureChange}
            onRuntimeReady={() => {
              scheduleMapPageStateUpdate(() => {
                setRuntimeError(null)
              })
            }}
            onRuntimeError={(message) => {
              scheduleMapPageStateUpdate(() => {
                setRuntimeError(message || 'Runtime の初期化に失敗しました')
              })
            }}
            onDataSourceChange={setDataSourceStatus}
          />
        ) : null}

        {!showSettings && (
          <div className="absolute left-3 top-3 z-40 md:left-4 md:top-4">
            <button
              type="button"
              aria-label="設定を開く"
              title="設定を開く"
              onClick={() => setShowSettings(true)}
              className="bg-white/90 hover:bg-white text-gray-800 border border-gray-200 shadow-lg p-2 rounded-full backdrop-blur transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}

        {hierarchyBadge && !showHierarchicalOverview && !(resolvedRegionConfig.regionId === 'japan' && overviewLevel === 'detail' && selectedOverviewPrefecture) && (
          <div className={`absolute z-40 ${showSettings ? 'left-3 top-3' : 'left-16 top-3 md:left-20 md:top-4'}`}>
            <div className="rounded-xl border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
              <div className="font-medium text-gray-500">階層表示</div>
              <div className="font-semibold text-gray-900">{hierarchyBadge}</div>
            </div>
          </div>
        )}

        {resolvedRegionConfig.regionId === 'japan' && overviewLevel === 'detail' && selectedOverviewPrefecture && !showSettings && (
          <div className={`absolute z-40 ${showSettings ? 'left-3 top-20' : 'left-3 top-16 md:left-4 md:top-20'}`}>
            <div className="w-[min(22rem,calc(100vw-6rem))] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <button type="button" onClick={goToNationOverview} className="hover:text-blue-600 transition font-medium">全国</button>
                <span>/</span>
                <button type="button" onClick={() => {
                  restorePrefectureOverviewViewport(selectedOverviewPrefecture)
                  setSelectedFeatureRaw(null)
                  setSelectedMunicipalityName(null)
                  setSelectedMunicipalityCode(null)
                  setSearchTarget(null)
                  setOverviewLevel('prefecture')
                }} className="hover:text-blue-600 transition font-medium">{selectedOverviewPrefecture}</button>
                <span>/</span>
                <span className="font-semibold text-slate-700">詳細</span>
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900">{detailContextTitle}</div>
              <div className="mt-1 text-sm text-slate-600">{selectedOverviewPrefecture} 内の詳細レイヤを表示中</div>
              {selectedPrefectureSummary && (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">
                    L3 拠点 {selectedPrefectureSummary.teamActivityCount} 件
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
                    活動あり {selectedPrefectureSummary.activeMunicipalityCount} / {selectedPrefectureSummary.municipalityCount} 市区町村
                  </span>
                </div>
              )}
              {dataSourceStatus && (dataSourceStatus.shelter.source !== 'none' || dataSourceStatus.teamActivity.source !== 'none') && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                  {dataSourceStatus.shelter.source !== 'none' && (
                    <span>
                      避難所: {dataSourceStatus.shelter.source === 'network' ? '最新' : dataSourceStatus.shelter.source === 'cache' ? 'キャッシュ' : dataSourceStatus.shelter.source === 'fallback' ? '初期データ' : '読込中…'}
                    </span>
                  )}
                  {dataSourceStatus.teamActivity.source !== 'none' && (
                    <span>
                      活動: {dataSourceStatus.teamActivity.source === 'network' ? '最新' : dataSourceStatus.teamActivity.source === 'cache' ? 'キャッシュ' : dataSourceStatus.teamActivity.source === 'fallback' ? '初期データ' : '読込中…'}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    restorePrefectureOverviewViewport(selectedOverviewPrefecture)
                    setSelectedFeatureRaw(null)
                    setSelectedMunicipalityName(null)
                    setSelectedMunicipalityCode(null)
                    setSearchTarget(null)
                    setOverviewLevel('prefecture')
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-2 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  市区町村を選ぶ
                </button>
                <button
                  type="button"
                  onClick={goToNationOverview}
                  className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/90 px-2 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  県を選ぶ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 共有ボタン（上部コントロール領域へ配置） */}
        <div className="absolute right-3 top-3 z-40 flex flex-col items-end gap-2 md:right-4 md:top-4">
          {resolvedRegionConfig.regionId === 'japan' && overviewLevel !== 'nation' && (
            <button
              type="button"
              aria-label={overviewLevel === 'prefecture' ? '全国 overview に戻る' : `${selectedOverviewPrefecture ?? '県'} overview に戻る`}
              title={overviewLevel === 'prefecture' ? '全国 overview に戻る' : `${selectedOverviewPrefecture ?? '県'} overview に戻る`}
              onClick={handleOverviewBack}
              className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white/95 px-3 text-sm font-medium text-gray-900 shadow-lg backdrop-blur transition hover:bg-white"
            >
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="truncate max-w-[10rem]">
                {overviewLevel === 'prefecture' ? '全国' : selectedOverviewPrefecture ?? '県'}
              </span>
            </button>
          )}
          {resolvedRegionConfig.regionId !== 'japan' && (
            <>
              <button
                type="button"
                aria-label="市を選ぶ"
                title="市を選ぶ"
                onClick={goToMunicipalitySelection}
                className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white/95 px-3 text-sm font-medium text-gray-900 shadow-lg backdrop-blur transition hover:bg-white"
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="truncate max-w-[10rem]">市を選ぶ</span>
              </button>
              <button
                type="button"
                aria-label="県を選ぶ"
                title="県を選ぶ"
                onClick={() => handleRegionChange('japan')}
                className="flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white/95 px-3 text-sm font-medium text-gray-900 shadow-lg backdrop-blur transition hover:bg-white"
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="truncate max-w-[10rem]">県を選ぶ</span>
              </button>
            </>
          )}
          <button
            type="button"
            aria-label="拡大"
            title="拡大"
            onClick={handleZoomIn}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white/95 text-gray-900 shadow-lg backdrop-blur transition hover:bg-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="縮小"
            title="縮小"
            onClick={handleZoomOut}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white/95 text-gray-900 shadow-lg backdrop-blur transition hover:bg-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="現在地へ移動"
            title="現在地へ移動"
            onClick={handleLocate}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white/95 text-gray-900 shadow-lg backdrop-blur transition hover:bg-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4m10-10h-4M6 12H2m15-5l-2.5 2.5M9.5 14.5 7 17m0-10 2.5 2.5M17 17l-2.5-2.5" />
              <circle cx="12" cy="12" r="3" strokeWidth="2" />
            </svg>
          </button>
          <ShareButton
            state={currentMapState}
            regionId={resolvedRegionConfig.regionId}
          />
        </div>

        {runtimeError && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm p-4">
            <div className="max-w-md w-full rounded-xl border border-red-200 bg-white p-5 shadow-xl">
              <h2 className="text-lg font-semibold text-red-700 mb-2">地図の初期化に失敗しました</h2>
              <p className="text-sm text-gray-700 mb-4 break-words">{runtimeError}</p>
              <button
                type="button"
                onClick={() => {
                  setRuntimeError(null)
                  if (mapEngine === 'svgmap') {
                    setSvgRuntimeReloadToken((prev) => prev + 1)
                  } else {
                    setMapLibreRuntimeReloadToken((prev) => prev + 1)
                  }
                }}
                className="w-full rounded-lg bg-red-600 text-white px-4 py-2.5 hover:bg-red-700 transition-colors"
              >
                再試行
              </button>
            </div>
          </div>
        )}

        <PropertySheet
          selectedFeature={selectedFeature}
          sidebarOpen={showSettings}
          onClose={closeSelectedFeature}
        />
      </div>
        </>
      )}
    </div>
  )
}
