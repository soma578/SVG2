export type CurrentMapRegionConfig = {
  regionId: string
  regionLabel: string
  appTitle: string
  appDescription: string
  searchPlaceholder: string
  runtimeConfigUrl: string
  municipalitiesLowZoomGeoJsonUrl: string
  municipalitiesMidZoomGeoJsonUrl: string
  districtDictionaryUrl: string
  municipalitiesGeoJsonUrl: string
  svgBaseAreaLayerUrl: string
  /** Lightweight municipality-outline SVG for zoom < threshold. Falls back to svgBaseAreaLayerUrl. */
  svgBaseAreaSimpleLayerUrl?: string | null
  sheltersFallbackGeoJsonUrl: string
  teamActivityFallbackJsonUrl: string
  sheltersSourceLabel: string
  teamActivitySourceLabel: string
  /** Municipality-split district GeoJSON index. Key: 5-digit JIS code, value: static file path. */
  districtIndexByMunicipality?: Record<string, string> | null
  /** Municipality-split district SVG index for SVGMap. Key: 5-digit JIS code, value: static file path. */
  districtSvgIndexByMunicipality?: Record<string, string> | null
  /** Path to district SVG summary.json (featureCount per municipality). */
  districtSvgSummaryPath?: string | null
  /** Municipality-split evacuation SVG index for SVGMap. Key: 5-digit JIS code, value: static file path. */
  evacuationSvgIndexByMunicipality?: Record<string, string> | null
  /** Municipality-split team-activity SVG index for SVGMap. Key: 5-digit JIS code, value: static file path. */
  teamActivitySvgIndexByMunicipality?: Record<string, string> | null
}

export type CurrentMapRegionManifest = Partial<CurrentMapRegionConfig>
export type CurrentMapRegionListEntry = Pick<
  CurrentMapRegionConfig,
  'regionId' | 'regionLabel' | 'appTitle'
>
export type CurrentMapRegionIndex = {
  regions: CurrentMapRegionListEntry[]
}

const DEFAULT_APP_TITLE = '防災マップ'

function readEnv(name: string, fallback: string): string {
  const value = process.env[name]
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  return normalized || fallback
}

function buildDefaultRegionAssetUrl(regionId: string, filename: string): string {
  return `/regions/${regionId}/${filename.replace(/^\/+/, '')}`
}

const defaultRegionId = readEnv('NEXT_PUBLIC_CURRENT_MAP_REGION_ID', 'japan')

function buildDefaultCurrentMapRegionConfig(regionId: string): CurrentMapRegionConfig {
  const isJapan = regionId === 'japan'
  return {
    regionId,
    regionLabel: isJapan ? '全国' : '岡山',
    appTitle: DEFAULT_APP_TITLE,
    appDescription: isJapan
      ? '全国表示向けの current-map です。低ズームでは自治体境界を中心に表示します。'
      : '表示対象は L1 ベースエリア、L2 避難所、L3 チーム活動に絞っています。',
    searchPlaceholder: isJapan
      ? '都道府県名・市区町村名で検索'
      : '地区名・避難所名・チーム名で検索',
    runtimeConfigUrl: buildDefaultRegionAssetUrl(regionId, 'runtime-config.json'),
    municipalitiesLowZoomGeoJsonUrl: isJapan
      ? '/data/source/national/prefectures-low.geojson'
      : buildDefaultRegionAssetUrl(regionId, 'municipalities.geojson'),
    municipalitiesMidZoomGeoJsonUrl: isJapan
      ? '/data/source/national/prefectures-low.geojson'
      : buildDefaultRegionAssetUrl(regionId, 'municipalities.geojson'),
    districtDictionaryUrl: buildDefaultRegionAssetUrl(regionId, 'district-dict.json'),
    municipalitiesGeoJsonUrl: isJapan
      ? '/data/source/national/prefectures-low.geojson'
      : buildDefaultRegionAssetUrl(regionId, 'municipalities.geojson'),
    svgBaseAreaLayerUrl: isJapan ? '/map/layers/base_area_japan.svg' : '/map/layers/base_area_okayama.svg',
    sheltersFallbackGeoJsonUrl: buildDefaultRegionAssetUrl(regionId, 'shelters-fallback.geojson'),
    teamActivityFallbackJsonUrl: buildDefaultRegionAssetUrl(regionId, 'team-activity-fallback.json'),
    sheltersSourceLabel: isJapan ? 'data/source/national/shelters-light.geojson' : 'public/data/shelters.json',
    teamActivitySourceLabel: isJapan ? 'national team activity (pending)' : `team_activity_${regionId}.json`,
  }
}

function sanitizeRegionConfigPart(
  overrides?: CurrentMapRegionManifest | null
): Partial<CurrentMapRegionConfig> {
  if (!overrides) return {}

  const stringFields = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
  ) as Partial<CurrentMapRegionConfig>

  // Object fields are not handled by the string filter above; merge them explicitly.
  const sanitizeMuniIndex = (raw: unknown): Record<string, string> | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const out: Record<string, string> = {}
    for (const [code, path] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof code === 'string' && /^\d{5}$/.test(code) && typeof path === 'string' && path.trim()) {
        out[code] = path.trim()
      }
    }
    return Object.keys(out).length > 0 ? out : null
  }

  const geoIdx = sanitizeMuniIndex((overrides as any).districtIndexByMunicipality)
  if (geoIdx) stringFields.districtIndexByMunicipality = geoIdx

  const svgIdx = sanitizeMuniIndex((overrides as any).districtSvgIndexByMunicipality)
  if (svgIdx) stringFields.districtSvgIndexByMunicipality = svgIdx

  const evacSvgIdx = sanitizeMuniIndex((overrides as any).evacuationSvgIndexByMunicipality)
  if (evacSvgIdx) stringFields.evacuationSvgIndexByMunicipality = evacSvgIdx

  const teamActivitySvgIdx = sanitizeMuniIndex((overrides as any).teamActivitySvgIndexByMunicipality)
  if (teamActivitySvgIdx) stringFields.teamActivitySvgIndexByMunicipality = teamActivitySvgIdx

  return stringFields
}

function applyEnvOverrides(config: CurrentMapRegionConfig): CurrentMapRegionConfig {
  return {
    regionId: readEnv('NEXT_PUBLIC_CURRENT_MAP_REGION_ID', config.regionId),
    regionLabel: readEnv('NEXT_PUBLIC_CURRENT_MAP_REGION_LABEL', config.regionLabel),
    appTitle: readEnv('NEXT_PUBLIC_CURRENT_MAP_APP_TITLE', config.appTitle),
    appDescription: readEnv('NEXT_PUBLIC_CURRENT_MAP_APP_DESCRIPTION', config.appDescription),
    searchPlaceholder: readEnv(
      'NEXT_PUBLIC_CURRENT_MAP_SEARCH_PLACEHOLDER',
      config.searchPlaceholder
    ),
    runtimeConfigUrl: readEnv('NEXT_PUBLIC_CURRENT_MAP_RUNTIME_CONFIG_URL', config.runtimeConfigUrl),
    municipalitiesLowZoomGeoJsonUrl: readEnv(
      'NEXT_PUBLIC_CURRENT_MAP_MUNICIPALITIES_LOW_GEOJSON_URL',
      config.municipalitiesLowZoomGeoJsonUrl
    ),
    municipalitiesMidZoomGeoJsonUrl: readEnv(
      'NEXT_PUBLIC_CURRENT_MAP_MUNICIPALITIES_MID_GEOJSON_URL',
      config.municipalitiesMidZoomGeoJsonUrl
    ),
    districtDictionaryUrl: readEnv('NEXT_PUBLIC_CURRENT_MAP_DISTRICT_DICT_URL', config.districtDictionaryUrl),
    municipalitiesGeoJsonUrl: readEnv(
      'NEXT_PUBLIC_CURRENT_MAP_MUNICIPALITIES_GEOJSON_URL',
      config.municipalitiesGeoJsonUrl
    ),
    svgBaseAreaLayerUrl: readEnv(
      'NEXT_PUBLIC_CURRENT_MAP_SVG_BASE_AREA_LAYER_URL',
      config.svgBaseAreaLayerUrl
    ),
    sheltersFallbackGeoJsonUrl: readEnv(
      'NEXT_PUBLIC_CURRENT_MAP_SHELTERS_FALLBACK_GEOJSON_URL',
      config.sheltersFallbackGeoJsonUrl
    ),
    teamActivityFallbackJsonUrl: readEnv(
      'NEXT_PUBLIC_CURRENT_MAP_TEAM_ACTIVITY_FALLBACK_JSON_URL',
      config.teamActivityFallbackJsonUrl
    ),
    sheltersSourceLabel: readEnv('NEXT_PUBLIC_CURRENT_MAP_SHELTERS_SOURCE', config.sheltersSourceLabel),
    teamActivitySourceLabel: readEnv(
      'NEXT_PUBLIC_CURRENT_MAP_TEAM_ACTIVITY_SOURCE',
      config.teamActivitySourceLabel
    ),
    districtIndexByMunicipality: config.districtIndexByMunicipality ?? null,
    svgBaseAreaSimpleLayerUrl: config.svgBaseAreaSimpleLayerUrl ?? null,
    districtSvgIndexByMunicipality: config.districtSvgIndexByMunicipality ?? null,
    districtSvgSummaryPath: config.districtSvgSummaryPath ?? null,
    evacuationSvgIndexByMunicipality: config.evacuationSvgIndexByMunicipality ?? null,
    teamActivitySvgIndexByMunicipality: config.teamActivitySvgIndexByMunicipality ?? null,
  }
}

export const currentMapRegionConfig: CurrentMapRegionConfig = applyEnvOverrides(
  buildDefaultCurrentMapRegionConfig(defaultRegionId)
)

export function getCurrentMapManifestUrl(regionId = currentMapRegionConfig.regionId) {
  return buildDefaultRegionAssetUrl(regionId, 'manifest.json')
}

export function getCurrentMapRegionIndexUrl() {
  return '/regions/index.json'
}

export function mergeCurrentMapRegionConfig(
  overrides?: CurrentMapRegionManifest | null
): CurrentMapRegionConfig {
  const regionId = String(overrides?.regionId || currentMapRegionConfig.regionId).trim() || currentMapRegionConfig.regionId
  const baseConfig = buildDefaultCurrentMapRegionConfig(regionId)
  const mergedConfig = {
    ...baseConfig,
    ...sanitizeRegionConfigPart(overrides),
  }

  return applyEnvOverrides(mergedConfig)
}

export async function loadCurrentMapRegionConfig(regionId = currentMapRegionConfig.regionId): Promise<CurrentMapRegionConfig> {
  const manifestUrl = getCurrentMapManifestUrl(regionId)

  try {
    const response = await fetch(manifestUrl, { cache: 'no-store' })
    if (!response.ok) {
      return currentMapRegionConfig
    }
    const manifest = await response.json() as CurrentMapRegionManifest
    return mergeCurrentMapRegionConfig(manifest)
  } catch {
    return currentMapRegionConfig
  }
}

export async function loadCurrentMapRegionIndex(): Promise<CurrentMapRegionListEntry[]> {
  try {
    const response = await fetch(getCurrentMapRegionIndexUrl(), { cache: 'no-store' })
    if (!response.ok) {
      return [{
        regionId: currentMapRegionConfig.regionId,
        regionLabel: currentMapRegionConfig.regionLabel,
        appTitle: currentMapRegionConfig.appTitle,
      }]
    }
    const payload = await response.json() as Partial<CurrentMapRegionIndex>
    const regions = Array.isArray(payload?.regions) ? payload.regions : []
    const normalized = regions.flatMap((entry) => {
      const regionId = String(entry?.regionId || '').trim()
      if (!regionId) return []
      return [{
        regionId,
        regionLabel: String(entry?.regionLabel || regionId).trim() || regionId,
        appTitle: String(entry?.appTitle || DEFAULT_APP_TITLE).trim() || DEFAULT_APP_TITLE,
      }]
    })
    return normalized.length > 0
      ? normalized
      : [{
          regionId: currentMapRegionConfig.regionId,
          regionLabel: currentMapRegionConfig.regionLabel,
          appTitle: currentMapRegionConfig.appTitle,
        }]
  } catch {
    return [{
      regionId: currentMapRegionConfig.regionId,
      regionLabel: currentMapRegionConfig.regionLabel,
      appTitle: currentMapRegionConfig.appTitle,
    }]
  }
}

export function resolveCurrentMapRegionId(
  requestedRegionId: string | null | undefined,
  availableRegions: CurrentMapRegionListEntry[],
  fallbackRegionId = currentMapRegionConfig.regionId
) {
  const normalizedRequestedRegionId = String(requestedRegionId || '').trim()
  if (!normalizedRequestedRegionId) {
    return fallbackRegionId
  }
  return availableRegions.some((entry) => entry.regionId === normalizedRequestedRegionId)
    ? normalizedRequestedRegionId
    : fallbackRegionId
}

export function getCurrentMapDisplayTitle(config: CurrentMapRegionConfig = currentMapRegionConfig) {
  const appTitle = config.appTitle.trim()
  const regionLabel = config.regionLabel.trim()
  if (!regionLabel) return appTitle
  if (appTitle.includes(regionLabel)) return appTitle
  return `${regionLabel}${appTitle}`
}

export function getCurrentMapMunicipalitiesGeoJsonUrl(
  config: CurrentMapRegionConfig = currentMapRegionConfig,
  zoom = 0
) {
  if (config.regionId === 'japan') {
    if (zoom < 6) {
      return config.municipalitiesLowZoomGeoJsonUrl || config.municipalitiesGeoJsonUrl
    }
    if (zoom < 9) {
      return config.municipalitiesMidZoomGeoJsonUrl || config.municipalitiesGeoJsonUrl
    }
    return config.municipalitiesGeoJsonUrl
  }
  if (zoom < 9) {
    return config.municipalitiesLowZoomGeoJsonUrl || config.municipalitiesGeoJsonUrl
  }
  if (zoom < 11) {
    return config.municipalitiesMidZoomGeoJsonUrl || config.municipalitiesGeoJsonUrl
  }
  return config.municipalitiesGeoJsonUrl
}
