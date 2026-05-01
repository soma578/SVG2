'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './page.module.css'

type TeamEntry = {
  id?: string
  title?: string
  status?: string
  note?: string
  activityType?: string
  operator?: string
  updatedAt?: string
}

type RuntimeFeature = {
  id?: string
  title?: string
  type?: string
  layerId?: string
  category?: string
  kind?: string
  status?: string
  summary?: string
  description?: string
  address?: string
  resolvedArea?: string
  municipalityCode?: string
  n03Code?: string
  lat?: number
  lon?: number
  activityType?: string
  operator?: string
  note?: string
  memo?: string
  area?: string
  updatedAt?: string
  capacity?: number | string
  shelterType?: string
  feature?: Record<string, unknown>
  teams?: TeamEntry[]
}

type RuntimeDataSource = 'network' | 'cache' | 'fallback'

type DataStatusEntry = {
  key: string
  label: string
  source: RuntimeDataSource
  url?: string
  online?: boolean
  updatedAt?: string
  message?: string
}

type LayerState = {
  id: string
  label: string
  visible: boolean
  disabled?: boolean
  note?: string
}

type RegionOption = {
  id: string
  prefCode?: string
  label: string
  prefecture: string
  municipality?: string
  runtimeConfigUrl: string
  dataStatus?: string
}

type InteractionMode =
  | 'select-prefecture'
  | 'select-municipality'
  | 'select-area'
  | 'inspect-area'

const INITIAL_LAYERS: LayerState[] = [
  { id: 'baseArea', label: '地域境界', visible: true },
  { id: 'evacuation', label: '避難所', visible: true },
  { id: 'teamActivity', label: '活動情報', visible: true },
  { id: 'hazard', label: 'ハザード', visible: false, disabled: true, note: '準備中' },
]

const DEFAULT_REGION: RegionOption = {
  id: 'okayama',
  prefCode: '33',
  label: '岡山県',
  prefecture: '岡山県',
  municipality: '岡山市',
  runtimeConfigUrl: '/map/regions/okayama/runtime-config.json',
  dataStatus: 'available',
}

const DATA_STATUS_LABELS: Record<string, string> = {
  runtimeConfig: '地域設定',
  evacuation: '避難所',
  evacuationHitRecords: '避難所検索',
  teamActivity: '活動情報',
  baseArea: '地域境界',
  districtSvg: '地区境界',
}

const DATA_CACHE_NAME = 'svgmap-runtime-data-v1'
const MAP_RUNTIME_VERSION = 'unified-feature-select-debug-v4'

const EVACUATION_LEGEND = [
  { key: 'open', label: '開設中', icon: '/map/icons/shelter-open.svg' },
  { key: 'limited', label: '定員間近', icon: '/map/icons/shelter-limited.svg' },
  { key: 'full', label: '満員', icon: '/map/icons/shelter-full.svg' },
  { key: 'closed', label: '閉鎖', icon: '/map/icons/shelter-closed.svg' },
] as const

const TEAM_LEGEND = [
  { key: 'active', label: '活動中', icon: '/map/icons/team-active.svg' },
  { key: 'planned', label: '計画中', icon: '/map/icons/team-planned.svg' },
  { key: 'standby', label: '待機中', icon: '/map/icons/team-standby.svg' },
  { key: 'completed', label: '完了', icon: '/map/icons/team-completed.svg' },
  { key: 'attention', label: '要確認', icon: '/map/icons/team-attention.svg' },
] as const

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

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const normalizeLayerId = (value: unknown): string | undefined => {
  const raw = stringValue(value)
  if (!raw) return undefined
  const normalized = raw.toLowerCase()
  if (normalized.includes('team') || normalized.includes('activity') || raw.includes('活動')) return 'teamActivity'
  if (normalized.includes('evac') || normalized.includes('shelter') || raw.includes('避難')) return 'evacuation'
  if (normalized.includes('district') || normalized.includes('area') || normalized.includes('n03') || raw.includes('区域')) return 'area'
  if (normalized.includes('municipality') || normalized.includes('city') || raw.includes('市区町村')) return 'municipality'
  if (normalized === 'basearea' || normalized === 'base-area') return 'baseArea'
  return raw
}

const isAreaFeature = (feature: RuntimeFeature | null): boolean => {
  if (!feature) return false
  const layerId = normalizeLayerId(feature.layerId ?? feature.category ?? feature.type ?? feature.kind)
  return layerId === 'area' || layerId === 'municipality' || layerId === 'baseArea'
}

const isTeamActivityFeature = (feature: RuntimeFeature | null): boolean => {
  if (!feature) return false
  return feature.layerId === 'teamActivity' || feature.kind === 'teamActivity' || feature.type === 'teamActivity' || !!feature.teams?.length
}

const isEvacuationFeature = (feature: RuntimeFeature | null): boolean => {
  if (!feature) return false
  const layerId = normalizeLayerId(feature.layerId ?? feature.category ?? feature.type ?? feature.kind)
  return layerId === 'evacuation' || String(feature.type || '').includes('避難')
}

const sourceLabel = (source?: RuntimeDataSource) => {
  if (source === 'network') return 'オンライン更新'
  if (source === 'cache') return 'キャッシュ表示'
  if (source === 'fallback') return 'フォールバック'
  return '未読込'
}

const fetchJsonWithRuntimeCache = async <T,>(url: string): Promise<{ data: T; source: RuntimeDataSource }> => {
  const absoluteUrl = new URL(url, window.location.href).href
  const request = new Request(absoluteUrl, { method: 'GET' })
  try {
    const response = await fetch(absoluteUrl, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return { data: await response.json() as T, source: 'network' }
  } catch (error) {
    if ('caches' in window) {
      const cache = await caches.open(DATA_CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) {
        console.warn('[page] using cached runtime data', { url, error })
        return { data: await cached.json() as T, source: 'cache' }
      }
    }
    throw error
  }
}

const formatActivityType = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'water') return '給水支援'
  if (normalized === 'supply') return '物資搬送'
  if (normalized === 'safety') return '安全確認'
  return value || '不明'
}

const formatActivityStatus = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'active') return '活動中'
  if (normalized === 'planned') return '計画中'
  if (normalized === 'completed') return '完了'
  if (normalized === 'needs_attention') return '要確認'
  if (normalized === 'standby') return '待機中'
  return value || '情報なし'
}

const formatShelterStatus = (value?: string) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'open') return '開設中'
  if (normalized === 'limited') return '定員間近'
  if (normalized === 'full') return '満員'
  if (normalized === 'closed') return '閉鎖'
  return value || '情報なし'
}

const getTeamIconSrc = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'active') return '/map/icons/team-active.svg'
  if (normalized === 'planned') return '/map/icons/team-planned.svg'
  if (normalized === 'completed') return '/map/icons/team-completed.svg'
  if (normalized === 'needs_attention') return '/map/icons/team-attention.svg'
  if (normalized === 'standby') return '/map/icons/team-standby.svg'
  return '/map/icons/team-standby.svg'
}

const getShelterIconSrc = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'open') return '/map/icons/shelter-open.svg'
  if (normalized === 'limited') return '/map/icons/shelter-limited.svg'
  if (normalized === 'full') return '/map/icons/shelter-full.svg'
  if (normalized === 'closed') return '/map/icons/shelter-closed.svg'
  return '/map/icons/shelter-default.svg'
}

const normalizeRuntimeFeature = (messageLike: unknown): RuntimeFeature | null => {
  const message = objectValue(messageLike)
  const payload = objectValue(message.payload ?? message.feature ?? message)
  if (Object.keys(payload).length === 0) return null

  const nestedFeature = objectValue(payload.feature)
  const properties = objectValue(payload.properties)
  const layerId = normalizeLayerId(
    payload.layerId ??
    payload.category ??
    payload.type ??
    payload.kind ??
    nestedFeature.layerId ??
    nestedFeature.category ??
    nestedFeature.type
  )
  const id = stringValue(payload.id ?? payload.featureId ?? nestedFeature.id ?? nestedFeature.featureId)
  const title = stringValue(
    payload.title ??
    payload.name ??
    properties.title ??
    properties.name ??
    nestedFeature.title ??
    nestedFeature.name ??
    id
  )
  const status = stringValue(payload.status ?? properties.status ?? nestedFeature.status) ?? 'unknown'
  const teamsSource =
    Array.isArray(payload.teams) ? payload.teams :
    Array.isArray(properties.teams) ? properties.teams :
    Array.isArray(nestedFeature.teams) ? nestedFeature.teams :
    []
  const { feature: _feature, teams: _teams, properties: _properties, ...flatPayload } = payload

  return {
    ...flatPayload,
    id: id ?? title ?? 'feature',
    title: title ?? '名称未設定',
    layerId,
    category: layerId,
    kind: stringValue(payload.kind ?? nestedFeature.kind) ?? layerId,
    status,
    summary: stringValue(payload.summary ?? properties.summary ?? nestedFeature.summary),
    description: stringValue(payload.description ?? properties.description ?? nestedFeature.description),
    address: stringValue(payload.address ?? properties.address ?? nestedFeature.address),
    resolvedArea: stringValue(payload.resolvedArea ?? properties.resolvedArea ?? nestedFeature.resolvedArea),
    municipalityCode: stringValue(
      payload.municipalityCode ??
      properties.municipalityCode ??
      nestedFeature.municipalityCode ??
      payload.n03Code ??
      properties.n03Code
    ),
    n03Code: stringValue(
      payload.n03Code ??
      properties.n03Code ??
      nestedFeature.n03Code ??
      payload.municipalityCode ??
      properties.municipalityCode
    ),
    lat: numberValue(payload.lat ?? properties.lat ?? nestedFeature.lat),
    lon: numberValue(payload.lon ?? properties.lon ?? nestedFeature.lon),
    activityType: stringValue(payload.activityType ?? properties.activityType ?? nestedFeature.activityType),
    operator: stringValue(payload.operator ?? properties.operator ?? nestedFeature.operator),
    note: stringValue(payload.note ?? payload.memo ?? properties.note ?? properties.memo ?? nestedFeature.note ?? nestedFeature.memo),
    memo: stringValue(payload.memo ?? properties.memo ?? nestedFeature.memo),
    area: stringValue(payload.area ?? properties.area ?? nestedFeature.area),
    updatedAt: stringValue(payload.updatedAt ?? payload.updatedAtText ?? properties.updatedAt ?? nestedFeature.updatedAt ?? nestedFeature.updatedAtText),
    capacity: numberValue(payload.capacity ?? properties.capacity ?? nestedFeature.capacity) ?? stringValue(payload.capacity ?? properties.capacity ?? nestedFeature.capacity),
    shelterType: stringValue(payload.shelterType ?? properties.shelterType ?? nestedFeature.shelterType),
    feature: { ...nestedFeature, ...properties, ...flatPayload },
    teams: teamsSource as TeamEntry[],
  }
}

function ShieldBrandIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5ba6ff" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="27" height="27" rx="8" fill="#ffffff" fillOpacity="0.96" />
      <path d="M16 6.8l7 2.3v5.9c0 4.4-2.9 8.2-7 10.2-4.1-2-7-5.8-7-10.2V9.1L16 6.8z" fill="url(#shieldGrad)" />
      <path d="M11.4 15.4l3.2-3.3 1.9 1.9 4.2-4.2 1.1 1.1-5.3 5.3-1.9-1.9-2.1 2.1-1.1-1z" fill="#ffffff" />
    </svg>
  )
}

function MiniFieldIcon({ kind }: { kind: 'place' | 'type' | 'memo' | 'time' | 'people' }) {
  const common = { width: '1em', height: '1em', viewBox: '0 0 24 24', 'aria-hidden': true, focusable: 'false' as const }

  if (kind === 'place') {
    return (
      <svg {...common}>
        <path d="M12 3.5a6.5 6.5 0 0 0-6.5 6.5c0 5.2 6.5 10.5 6.5 10.5S18.5 15.2 18.5 10A6.5 6.5 0 0 0 12 3.5Zm0 9.2A2.7 2.7 0 1 1 12 7.3a2.7 2.7 0 0 1 0 5.4Z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'type') {
    return (
      <svg {...common}>
        <path d="M5 6.5h14v2H5v-2Zm0 5h14v2H5v-2Zm0 5h9v2H5v-2Z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'memo') {
    return (
      <svg {...common}>
        <path d="M7 4.8h7.2l3.8 3.8V19a1.7 1.7 0 0 1-1.7 1.7H7A1.7 1.7 0 0 1 5.3 19V6.5A1.7 1.7 0 0 1 7 4.8Zm6.4 1.7V8.7h2.2l-2.2-2.2Zm-4.4 5h8v1.8H9v-1.8Zm0 3.8h8v1.8H9v-1.8Z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'time') {
    return (
      <svg {...common}>
        <path d="M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6Zm0 1.8a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm.8 2.2h-1.7v4.2l3.6 2.2.9-1.4-2.8-1.7V8.2Z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm8 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM4.8 18.2c.4-2.2 2.3-3.8 4.6-3.8s4.2 1.6 4.6 3.8v1H4.8v-1Zm10.6 0c.4-2 2.1-3.4 4.1-3.4s3.7 1.4 4.1 3.4v1h-8.2v-1Z" fill="currentColor" />
    </svg>
  )
}

export default function MapPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [layers, setLayers] = useState<LayerState[]>(INITIAL_LAYERS)
  const [selectedFeature, setSelectedFeature] = useState<RuntimeFeature | null>(null)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select-area')
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [dataStatuses, setDataStatuses] = useState<Record<string, DataStatusEntry>>({})

  const selectedRegion = DEFAULT_REGION
  const selectedPrefecture = selectedRegion.prefecture
  const selectedMunicipality = selectedRegion.municipality ?? '未選択'

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      embed: '1',
      regionId: selectedRegion.id,
      runtimeConfigUrl: selectedRegion.runtimeConfigUrl,
      v: MAP_RUNTIME_VERSION,
    })
    return `/map/webapp/current-map.html?${params.toString()}`
  }, [selectedRegion.id, selectedRegion.runtimeConfigUrl])

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
      if (event.origin !== window.location.origin) return
      const message = objectValue(event.data)
      const type = stringValue(message.type)
      if (!type) return

      if (type === 'runtime:ready') {
        console.log('[page] runtime:ready', message.payload)
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

      if (type === 'runtime:featureSelect') {
        const feature = normalizeRuntimeFeature(message)
        console.log('[page] runtime:featureSelect', feature)
        if (isAreaFeature(feature)) {
          setInteractionMode('inspect-area')
        }
        setSelectedFeature(feature)
        return
      }

      if (type === 'runtime:dataStatus') {
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

  const toggleLayer = useCallback((layerId: string) => {
    setLayers((prev) => {
      const next = prev.map((layer) => {
        if (layer.id !== layerId || layer.disabled) return layer
        return { ...layer, visible: !layer.visible }
      })
      const target = next.find((layer) => layer.id === layerId)
      if (target && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({
          type: 'runtime:setLayerVisibility',
          layerId,
          visible: target.visible,
        }, window.location.origin)
      }
      return next
    })
  }, [])

  const featureLayerLabel = isTeamActivityFeature(selectedFeature)
    ? '活動情報'
    : isEvacuationFeature(selectedFeature)
      ? '避難所'
      : '選択中'

  const featureIconSrc = isTeamActivityFeature(selectedFeature)
    ? getTeamIconSrc(selectedFeature?.status)
    : isEvacuationFeature(selectedFeature)
      ? getShelterIconSrc(selectedFeature?.status)
      : '/map/icons/team-standby.svg'

  const featureTitle = selectedFeature?.title || selectedFeature?.id || '名称未設定'
  const featureStatusLabel = isTeamActivityFeature(selectedFeature)
    ? formatActivityStatus(selectedFeature?.status)
    : isEvacuationFeature(selectedFeature)
      ? formatShelterStatus(selectedFeature?.status)
      : selectedFeature?.status || '情報なし'
  const featureSubtitle = isTeamActivityFeature(selectedFeature)
    ? (selectedFeature?.area || selectedFeature?.resolvedArea || selectedFeature?.address || '活動エリア未設定')
    : (selectedFeature?.address || selectedFeature?.resolvedArea || selectedFeature?.summary || '施設情報未設定')

  const featureRows = useMemo(() => {
    if (!selectedFeature) return []
    if (isTeamActivityFeature(selectedFeature)) {
      return [
        { label: '活動種別', value: formatActivityType(selectedFeature.activityType || selectedFeature.type) },
        { label: '担当', value: selectedFeature.operator || '不明' },
        { label: '活動エリア', value: selectedFeature.area || selectedFeature.resolvedArea || selectedFeature.address || '不明' },
        { label: 'メモ', value: selectedFeature.note || selectedFeature.memo || selectedFeature.summary || '不明' },
        { label: '最終更新', value: selectedFeature.updatedAt || '不明' },
      ]
    }
    if (isEvacuationFeature(selectedFeature)) {
      return [
        { label: '住所', value: selectedFeature.address || selectedFeature.resolvedArea || '不明' },
        { label: '状態', value: formatShelterStatus(selectedFeature.status) },
        { label: '収容人数', value: stringValue(selectedFeature.capacity) || '不明' },
        { label: '種別', value: selectedFeature.shelterType || selectedFeature.type || '不明' },
        { label: '備考', value: selectedFeature.note || selectedFeature.memo || selectedFeature.summary || '不明' },
        { label: '最終更新', value: selectedFeature.updatedAt || '不明' },
      ]
    }
    return [
      { label: '住所', value: selectedFeature.address || selectedFeature.resolvedArea || '不明' },
      { label: '状態', value: selectedFeature.status || '情報なし' },
      { label: '備考', value: selectedFeature.summary || selectedFeature.description || '不明' },
    ]
  }, [selectedFeature])

  const handleFeatureAction = useCallback(() => {
    if (!selectedFeature) return
    iframeRef.current?.focus()
    console.log('[page] feature locate requested', {
      id: selectedFeature.id,
      layerId: selectedFeature.layerId,
    })
  }, [selectedFeature])

  useEffect(() => {
    console.log('[page] selectedFeature changed', selectedFeature)
  }, [selectedFeature])

  useEffect(() => {
    console.log('[page] interactionMode changed', interactionMode)
  }, [interactionMode])

  return (
    <main className={styles.shell}>
      <header className={styles.topBar}>
        <div className={styles.topBarBrand}>
          <div className={styles.topBarIcon} aria-hidden="true">
            <ShieldBrandIcon />
          </div>
          <div className={styles.topBarTitleGroup}>
            <div className={styles.topBarTitle}>防災マップ</div>
            <div className={styles.topBarSubtitle}>地域境界・避難所・活動情報の可視化</div>
          </div>
        </div>

      </header>

      <section className={styles.mapFrame}>
        <iframe
          key={iframeSrc}
          ref={iframeRef}
          src={iframeSrc}
          title="SVGMap"
          className={styles.iframe}
        />
      </section>

      <aside className={styles.sidebar}>
        <section className={`${styles.featureCard} ${isEvacuationFeature(selectedFeature) ? styles.featureCardEvacuation : styles.featureCardActivity}`}>
          <div className={styles.featureCardHeader}>
            <span className={styles.featureLayerBadge}>{featureLayerLabel}</span>
            {selectedFeature ? (
              <button
                type="button"
                className={styles.featureCardClose}
                onClick={() => setSelectedFeature(null)}
                aria-label="詳細を閉じる"
              >
                ×
              </button>
            ) : null}
          </div>

          {selectedFeature ? (
            <>
              <div className={styles.featureHero}>
                <div className={styles.featureIcon} aria-hidden="true">
                  <img src={featureIconSrc} alt="" />
                </div>
                <div className={styles.featureHeroText}>
                  <h3 className={styles.featureCardTitle}>{featureTitle}</h3>
                  <p className={styles.featureSubtitle}>{featureSubtitle}</p>
                  <span
                    className={styles.statusBadge}
                    style={{
                      backgroundColor: isTeamActivityFeature(selectedFeature)
                        ? '#2563eb'
                        : isEvacuationFeature(selectedFeature)
                          ? '#1d4ed8'
                          : '#64748b',
                    }}
                  >
                    {featureStatusLabel}
                  </span>
                </div>
              </div>

              <dl className={styles.featureDetail}>
                {featureRows.map((row) => (
                  <div key={row.label} className={styles.featureDetailRow}>
                    <dt>
                      <MiniFieldIcon kind={
                        row.label === '活動種別' ? 'type' :
                        row.label === '住所' || row.label === '活動エリア' ? 'place' :
                        row.label === 'メモ' || row.label === '備考' ? 'memo' :
                        row.label === '最終更新' ? 'time' : 'people'
                      } />
                      <span>{row.label}</span>
                    </dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>

              {selectedFeature.teams?.length ? (
                <section className={styles.teamsSection}>
                  <h4 className={styles.teamsSectionTitle}>地区内チーム一覧</h4>
                  <ul className={styles.teamsList}>
                    {selectedFeature.teams.map((team, index) => (
                      <li key={team.id || `${team.title || 'team'}-${index}`} className={styles.teamItem}>
                        <span
                          className={styles.teamStatusDot}
                          style={{
                            backgroundColor: team.status === 'active' ? '#2563eb' :
                              team.status === 'planned' ? '#d97706' :
                              team.status === 'completed' ? '#16a34a' :
                              team.status === 'needs_attention' ? '#dc2626' : '#94a3b8',
                          }}
                          aria-hidden="true"
                        />
                        <span className={styles.teamItemTitle}>{team.title || team.id || '活動'}</span>
                        <span className={styles.teamItemStatus}>{team.status || 'unknown'}</span>
                        {team.note ? <p className={styles.teamItemNote}>{team.note}</p> : null}
                        {team.activityType || team.operator ? (
                          <p className={styles.teamItemMeta}>
                            {[team.activityType, team.operator].filter(Boolean).join(' / ')}
                          </p>
                        ) : null}
                        {team.updatedAt ? <p className={styles.teamItemTime}>{team.updatedAt}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <button type="button" className={styles.primaryButton} onClick={handleFeatureAction}>
                <span aria-hidden="true">⌖</span>
                <span>{isTeamActivityFeature(selectedFeature) ? '活動エリアを地図で確認' : '避難所を地図で確認'}</span>
              </button>
            </>
          ) : (
            <div className={styles.emptyFeature}>
              <div className={styles.emptyFeatureIcon} aria-hidden="true">
                <img src="/map/icons/team-standby.svg" alt="" />
              </div>
              <h3>選択中の情報はありません</h3>
              <p>地図上の避難所または活動アイコンをクリックすると、ここに詳細が表示されます。</p>
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h2>レイヤー</h2>
          <div className={styles.layerToggleList}>
            {layers.map((layer) => (
              <div key={layer.id} className={styles.layerToggleItem} aria-disabled={layer.disabled || undefined}>
                <div>
                  <div>{layer.label}</div>
                  {layer.note ? <small>{layer.note}</small> : null}
                </div>
                <button
                  type="button"
                  className={`${styles.toggle} ${layer.visible ? styles.toggleOn : ''}`}
                  disabled={layer.disabled}
                  onClick={() => toggleLayer(layer.id)}
                  aria-label={`${layer.label} を切り替え`}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <h2>凡例</h2>
          <div className={styles.legendSection}>
            <p className={styles.legendTitle}>避難所</p>
            <ul className={styles.legendList}>
              {EVACUATION_LEGEND.map((item) => (
                <li key={item.key} className={styles.legendItem}>
                  <span className={styles.legendIcon} aria-hidden="true">
                    <img src={item.icon} alt="" />
                  </span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.legendSection}>
            <p className={styles.legendTitle}>チーム活動</p>
            <ul className={styles.legendList}>
              {TEAM_LEGEND.map((item) => (
                <li key={item.key} className={styles.legendItem}>
                  <span className={styles.legendIcon} aria-hidden="true">
                    <img src={item.icon} alt="" />
                  </span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.card}>
          <h2>データ状態</h2>
          <dl className={styles.dataStatus}>
            <dt>Runtime</dt>
            <dd>{runtimeReady ? 'ready' : 'loading'}</dd>
            <dt>接続</dt>
            <dd>{isOnline === null ? '確認中' : isOnline ? 'オンライン' : 'オフライン'}</dd>
            <dt>地域</dt>
            <dd>{selectedRegion.label || selectedRegion.prefecture}</dd>
          </dl>

          <div className={styles.dataStatusList}>
            {Object.values(dataStatuses).length ? (
              Object.values(dataStatuses).map((entry) => (
                <div key={entry.key} className={styles.dataStatusEntry}>
                  <strong>{entry.label}</strong>
                  <span
                    className={[
                      styles.dataSourceBadge,
                      entry.source === 'network'
                        ? styles.dataSource_network
                        : entry.source === 'cache'
                          ? styles.dataSource_cache
                          : styles.dataSource_fallback,
                    ].join(' ')}
                  >
                    {sourceLabel(entry.source)}
                    {entry.online === false ? ' / オフライン' : ''}
                  </span>
                  {entry.message ? <small className={styles.dataStatusMessage}>{entry.message}</small> : null}
                </div>
              ))
            ) : (
              <p className={styles.featureMuted}>まだデータ状態は受信していません。</p>
            )}
          </div>
        </section>
      </aside>
    </main>
  )
}
