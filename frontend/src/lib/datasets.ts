import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import * as XLSX from 'xlsx'
import { currentMapRegionConfig } from '@/lib/currentMapRegion'

export type DatasetType = 'shelters' | 'team-activity'

export type ValidationLevel = 'error' | 'warning'

export type ValidationIssue = {
  level: ValidationLevel
  line: number
  column?: string
  value?: unknown
  message: string
}

export type ShelterRecord = {
  id: string
  title: string
  kind: 'shelter'
  lat: number
  lon: number
  status: 'open' | 'closed' | 'full' | 'unknown'
  address: string | null
  capacity: number | null
  facilityType: string | null
  barrierFree: boolean | null
  pets: boolean | null
  updatedAt: string | null
  note: string | null
}

export type TeamActivityRecord = {
  id: string
  title: string
  kind: 'team'
  teamId: string
  teamName: string
  activityType: string
  status: 'active' | 'standby' | 'stopped' | 'unknown'
  lat: number
  lon: number
  updatedAt: string | null
  note: string | null
  operator: string | null
  area: string | null
}

export type NormalizedDatasetRecord = ShelterRecord | TeamActivityRecord

export type DatasetPublishMetadataInput = {
  regionId?: string | null
  updatedBy?: string | null
  updateNote?: string | null
  updateCadence?: string | null
}

export type DatasetMetadata = {
  datasetType: DatasetType
  regionId: string
  rowCount: number
  sourcePath: string
  updatedAt: string | null
  updatedBy: string | null
  updateNote: string | null
  updateCadence: string | null
}

export type UploadPreview = {
  datasetType: DatasetType
  normalized: NormalizedDatasetRecord[]
  previewRows: Record<string, unknown>[]
  issues: ValidationIssue[]
  summary: {
    rowCount: number
    errorCount: number
    warningCount: number
  }
}

type ParsedTable = {
  headers: string[]
  rows: Record<string, string>[]
}

type ParseSpreadsheetOptions = {
  sheet?: string | null
  datasetType?: DatasetType
}

type QueryOptions = {
  q?: string | null
  status?: string | null
  facilityType?: string | null
  activityType?: string | null
  bbox?: string | null
  limit?: number | null
  regionId?: string | null
  prefecture?: string | null
}

const SHELTER_REQUIRED_COLUMNS = ['id', 'title', 'lat', 'lon', 'status'] as const
const SHELTER_OPTIONAL_COLUMNS = ['address', 'capacity', 'facilityType', 'barrierFree', 'pets', 'updatedAt', 'note'] as const
const TEAM_REQUIRED_COLUMNS = ['id', 'teamId', 'teamName', 'title', 'activityType', 'status', 'lat', 'lon'] as const
const TEAM_OPTIONAL_COLUMNS = ['updatedAt', 'note', 'operator', 'area'] as const

const SHELTER_STATUS = new Set(['open', 'closed', 'full', 'unknown'])
const TEAM_STATUS = new Set(['active', 'standby', 'stopped', 'unknown'])

const resolveProjectPath = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url))

function getPublishedDatasetFilePath(datasetType: DatasetType, regionId?: string | null): string {
  const normalizedRegionId = sanitizeRegionId(regionId) ?? sanitizeRegionId(currentMapRegionConfig.regionId) ?? 'japan'
  const basePath =
    normalizedRegionId === currentMapRegionConfig.regionId
      ? '../../public/data'
      : `../../public/data/${normalizedRegionId}`
  const filename = datasetType === 'shelters' ? 'shelters.json' : 'team-activity.json'
  return resolveProjectPath(`${basePath}/${filename}`)
}

function getPublishedDatasetMetadataFilePath(datasetType: DatasetType, regionId?: string | null): string {
  const normalizedRegionId = sanitizeRegionId(regionId) ?? sanitizeRegionId(currentMapRegionConfig.regionId) ?? 'japan'
  const basePath =
    normalizedRegionId === currentMapRegionConfig.regionId
      ? '../../public/data'
      : `../../public/data/${normalizedRegionId}`
  const filename = datasetType === 'shelters' ? 'shelters.meta.json' : 'team-activity.meta.json'
  return resolveProjectPath(`${basePath}/${filename}`)
}

function getPublishedDatasetPublicUrl(datasetType: DatasetType, regionId?: string | null): string {
  const normalizedRegionId = sanitizeRegionId(regionId) ?? sanitizeRegionId(currentMapRegionConfig.regionId) ?? 'japan'
  const filename = datasetType === 'shelters' ? 'shelters.json' : 'team-activity.json'
  return normalizedRegionId === currentMapRegionConfig.regionId
    ? `/data/${filename}`
    : `/data/${normalizedRegionId}/${filename}`
}

const resolvePublicAssetPath = (publicUrlPath: string): string => {
  const normalized = publicUrlPath.replace(/^\/+/, '')
  return resolveProjectPath(`../../public/${normalized}`)
}

const SHELTER_GEOJSON_FALLBACK = resolvePublicAssetPath(currentMapRegionConfig.sheltersFallbackGeoJsonUrl)
const TEAM_JSON_FALLBACK = resolvePublicAssetPath(currentMapRegionConfig.teamActivityFallbackJsonUrl)

type RegionDatasetConfig = {
  regionId: string
  sheltersFallbackPath: string
  teamActivityFallbackPath: string
  sheltersSourceLabel: string
  teamActivitySourceLabel: string
}

function getDefaultRegionDatasetConfig(regionId: string): RegionDatasetConfig {
  const sheltersFallbackPath =
    regionId === 'japan'
      ? resolveProjectPath('../../../data/source/national/shelters-light.geojson')
      : resolvePublicAssetPath(`/regions/${regionId}/shelters-fallback.geojson`)

  return {
    regionId,
    sheltersFallbackPath,
    teamActivityFallbackPath: resolvePublicAssetPath(`/regions/${regionId}/team-activity-fallback.json`),
    sheltersSourceLabel: 'public/data/shelters.json',
    teamActivitySourceLabel: `team_activity_${regionId}.json`,
  }
}

async function loadRegionDatasetConfig(regionId?: string | null): Promise<RegionDatasetConfig> {
  const normalizedRegionId = sanitizeRegionId(regionId) ?? sanitizeRegionId(currentMapRegionConfig.regionId) ?? 'japan'
  const defaultConfig = getDefaultRegionDatasetConfig(normalizedRegionId)
  const manifestPath = resolvePublicAssetPath(`/regions/${normalizedRegionId}/manifest.json`)

  try {
    const manifest = await readJsonFile<Partial<{
      sheltersFallbackGeoJsonUrl: string
      teamActivityFallbackJsonUrl: string
      sheltersSourceLabel: string
      teamActivitySourceLabel: string
    }>>(manifestPath)
    if (!manifest) return defaultConfig

    return {
      regionId: normalizedRegionId,
      sheltersFallbackPath:
        normalizedRegionId === 'japan'
          ? defaultConfig.sheltersFallbackPath
          : resolvePublicAssetPath(
              manifest.sheltersFallbackGeoJsonUrl || `/regions/${normalizedRegionId}/shelters-fallback.geojson`
            ),
      teamActivityFallbackPath: resolvePublicAssetPath(
        manifest.teamActivityFallbackJsonUrl || `/regions/${normalizedRegionId}/team-activity-fallback.json`
      ),
      sheltersSourceLabel: normalizeString(manifest.sheltersSourceLabel) || defaultConfig.sheltersSourceLabel,
      teamActivitySourceLabel:
        normalizeString(manifest.teamActivitySourceLabel) || defaultConfig.teamActivitySourceLabel,
    }
  } catch {
    return defaultConfig
  }
}

function shouldUsePublishedDataset(regionId?: string | null): boolean {
  const normalizedRegionId = sanitizeRegionId(regionId)
  if (!normalizedRegionId) return true
  return normalizedRegionId === currentMapRegionConfig.regionId
}

function getFallbackSourceLabel(datasetType: DatasetType): string {
  return datasetType === 'shelters'
    ? currentMapRegionConfig.sheltersFallbackGeoJsonUrl
    : currentMapRegionConfig.teamActivityFallbackJsonUrl
}

function sampleEvenly<T>(items: T[], limit?: number | null): T[] {
  const normalizedLimit = Number(limit)
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0 || items.length <= normalizedLimit) {
    return items
  }

  const result: T[] = []
  const step = items.length / normalizedLimit
  for (let index = 0; index < normalizedLimit; index += 1) {
    const sourceIndex = Math.min(items.length - 1, Math.floor(index * step))
    result.push(items[sourceIndex])
  }
  return result
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (char === ',' && !quoted) {
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result.map((value) => value.trim())
}

function parseCsvText(csvText: string): ParsedTable {
  const normalized = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] ?? ''
    })
    return row
  })

  return { headers, rows }
}

function parseWorkbookBuffer(
  buffer: ArrayBuffer,
  options: ParseSpreadsheetOptions = {}
): ParsedTable {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const preferredSheetName =
    options.sheet ||
    (options.datasetType === 'shelters'
      ? 'shelters'
      : options.datasetType === 'team-activity'
        ? 'team_activity'
        : null)
  const sheetName = preferredSheetName && workbook.Sheets[preferredSheetName]
    ? preferredSheetName
    : workbook.SheetNames[0]

  if (!sheetName) {
    return { headers: [], rows: [] }
  }

  const sheet = workbook.Sheets[sheetName]
  const rowsAsArrays = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  })

  if (!rowsAsArrays.length) {
    return { headers: [], rows: [] }
  }

  const headers = rowsAsArrays[0].map((value) => String(value ?? '').trim())
  const rows = rowsAsArrays.slice(1)
    .filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
    .map((values) => {
      const row: Record<string, string> = {}
      headers.forEach((header, index) => {
        row[header] = String(values[index] ?? '').trim()
      })
      return row
    })

  return { headers, rows }
}

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized ? normalized : null
}

/**
 * regionId のパストラバーサル対策。
 * 英小文字・数字・ハイフンのみ許可し、それ以外を含む場合は null を返す。
 */
export function sanitizeRegionId(value: unknown): string | null {
  const raw = normalizeString(value)
  if (!raw) return null
  if (!/^[a-z0-9][a-z0-9-]*$/.test(raw)) return null
  if (raw.includes('--')) return null
  return raw
}

function normalizeBoolean(value: unknown): boolean | null {
  const normalized = normalizeString(value)?.toLowerCase()
  if (!normalized) return null
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  return null
}

function normalizeNumber(value: unknown): number | null {
  const normalized = normalizeString(value)
  if (normalized == null) return null
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function pushIssue(
  issues: ValidationIssue[],
  level: ValidationLevel,
  line: number,
  message: string,
  column?: string,
  value?: unknown
) {
  issues.push({ level, line, column, value, message })
}

function validateRequiredHeaders(headers: string[], required: readonly string[], issues: ValidationIssue[]) {
  for (const header of required) {
    if (!headers.includes(header)) {
      pushIssue(issues, 'error', 1, `必須列 ${header} が存在しません`, header)
    }
  }
}

function warnUnknownColumns(
  headers: string[],
  allowed: readonly string[],
  issues: ValidationIssue[]
) {
  for (const header of headers) {
    if (!allowed.includes(header)) {
      pushIssue(issues, 'warning', 1, `未知の列 ${header} は無視されます`, header)
    }
  }
}

function parseBBox(input?: string | null): [number, number, number, number] | null {
  if (!input) return null
  const parts = input.split(',').map((value) => Number(value.trim()))
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null
  return [parts[0], parts[1], parts[2], parts[3]]
}

function applyLimit<T>(items: T[], limit?: number | null): T[] {
  if (!Number.isFinite(limit) || !limit || limit <= 0) return items
  return items.slice(0, Math.min(limit, 500))
}

function matchesBBox(lat: number, lon: number, bbox: [number, number, number, number] | null): boolean {
  if (!bbox) return true
  const [minLon, minLat, maxLon, maxLat] = bbox
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
}

function serializePreviewRows(records: NormalizedDatasetRecord[]): Record<string, unknown>[] {
  return records.slice(0, 5).map((record) => ({ ...record }))
}

function isShelterStatus(value: string): value is ShelterRecord['status'] {
  return SHELTER_STATUS.has(value)
}

function isTeamStatus(value: string): value is TeamActivityRecord['status'] {
  return TEAM_STATUS.has(value)
}

export function normalizeUploadedDataset(
  datasetType: DatasetType,
  csvText: string,
  strict = false
): UploadPreview {
  const table = parseCsvText(csvText)
  return normalizeParsedTable(datasetType, table, strict)
}

export function normalizeUploadedWorkbook(
  datasetType: DatasetType,
  buffer: ArrayBuffer,
  strict = false,
  sheet?: string | null
): UploadPreview {
  const table = parseWorkbookBuffer(buffer, { datasetType, sheet })
  return normalizeParsedTable(datasetType, table, strict)
}

function normalizeParsedTable(
  datasetType: DatasetType,
  table: ParsedTable,
  strict = false
): UploadPreview {
  const issues: ValidationIssue[] = []

  if (datasetType === 'shelters') {
    validateRequiredHeaders(table.headers, SHELTER_REQUIRED_COLUMNS, issues)
    warnUnknownColumns(table.headers, [...SHELTER_REQUIRED_COLUMNS, ...SHELTER_OPTIONAL_COLUMNS], issues)
  } else {
    validateRequiredHeaders(table.headers, TEAM_REQUIRED_COLUMNS, issues)
    warnUnknownColumns(table.headers, [...TEAM_REQUIRED_COLUMNS, ...TEAM_OPTIONAL_COLUMNS], issues)
  }

  const normalized = datasetType === 'shelters'
    ? normalizeShelterRows(table.rows, issues)
    : normalizeTeamRows(table.rows, issues)

  const errorCount = issues.filter((issue) => issue.level === 'error').length
  const warningCount = issues.filter((issue) => issue.level === 'warning').length
  if (strict && warningCount > 0) {
    issues.push({
      level: 'error',
      line: 1,
      message: 'strict モードのため警告をエラーとして扱いました',
    })
  }

  return {
    datasetType,
    normalized,
    previewRows: serializePreviewRows(normalized),
    issues,
    summary: {
      rowCount: normalized.length,
      errorCount: errorCount + (strict && warningCount > 0 ? 1 : 0),
      warningCount,
    },
  }
}

function normalizeShelterRows(rows: Record<string, string>[], issues: ValidationIssue[]): ShelterRecord[] {
  const seenIds = new Set<string>()
  const normalized: ShelterRecord[] = []

  rows.forEach((row, index) => {
    const line = index + 2
    const id = normalizeString(row.id)
    const title = normalizeString(row.title)
    const lat = normalizeNumber(row.lat)
    const lon = normalizeNumber(row.lon)
    const status = normalizeString(row.status)?.toLowerCase()
    const capacity = normalizeNumber(row.capacity)
    const barrierFree = normalizeBoolean(row.barrierFree)
    const pets = normalizeBoolean(row.pets)

    if (!id) pushIssue(issues, 'error', line, 'id は必須です', 'id', row.id)
    if (!title) pushIssue(issues, 'error', line, 'title は必須です', 'title', row.title)
    if (lat == null) pushIssue(issues, 'error', line, 'lat は数値である必要があります', 'lat', row.lat)
    if (lon == null) pushIssue(issues, 'error', line, 'lon は数値である必要があります', 'lon', row.lon)
    if (!status || !isShelterStatus(status)) {
      pushIssue(issues, 'error', line, 'status は open/closed/full/unknown のいずれかです', 'status', row.status)
    }
    if (id && seenIds.has(id)) {
      pushIssue(issues, 'error', line, 'id が重複しています', 'id', row.id)
    }
    if (row.capacity && capacity == null) {
      pushIssue(issues, 'error', line, 'capacity は数値である必要があります', 'capacity', row.capacity)
    }
    if (row.barrierFree && barrierFree == null) {
      pushIssue(issues, 'warning', line, 'barrierFree は boolean として解釈できませんでした', 'barrierFree', row.barrierFree)
    }
    if (row.pets && pets == null) {
      pushIssue(issues, 'warning', line, 'pets は boolean として解釈できませんでした', 'pets', row.pets)
    }

    if (!row.updatedAt) pushIssue(issues, 'warning', line, 'updatedAt が空です', 'updatedAt')
    if (!row.capacity) pushIssue(issues, 'warning', line, 'capacity が空です', 'capacity')
    if (!row.note) pushIssue(issues, 'warning', line, 'note が空です', 'note')

    const hasRowError = issues.some((issue) => issue.level === 'error' && issue.line === line)
    if (hasRowError || !id || !title || lat == null || lon == null || !status || !isShelterStatus(status)) {
      return
    }

    seenIds.add(id)
    normalized.push({
      id,
      title,
      kind: 'shelter',
      lat,
      lon,
      status,
      address: normalizeString(row.address),
      capacity,
      facilityType: normalizeString(row.facilityType),
      barrierFree,
      pets,
      updatedAt: normalizeString(row.updatedAt),
      note: normalizeString(row.note),
    })
  })

  return normalized
}

function normalizeTeamRows(rows: Record<string, string>[], issues: ValidationIssue[]): TeamActivityRecord[] {
  const seenIds = new Set<string>()
  const normalized: TeamActivityRecord[] = []

  rows.forEach((row, index) => {
    const line = index + 2
    const id = normalizeString(row.id)
    const teamId = normalizeString(row.teamId)
    const teamName = normalizeString(row.teamName)
    const title = normalizeString(row.title)
    const activityType = normalizeString(row.activityType)
    const status = normalizeString(row.status)?.toLowerCase()
    const lat = normalizeNumber(row.lat)
    const lon = normalizeNumber(row.lon)

    if (!id) pushIssue(issues, 'error', line, 'id は必須です', 'id', row.id)
    if (!teamId) pushIssue(issues, 'error', line, 'teamId は必須です', 'teamId', row.teamId)
    if (!teamName) pushIssue(issues, 'error', line, 'teamName は必須です', 'teamName', row.teamName)
    if (!title) pushIssue(issues, 'error', line, 'title は必須です', 'title', row.title)
    if (!activityType) pushIssue(issues, 'error', line, 'activityType は必須です', 'activityType', row.activityType)
    if (!status || !isTeamStatus(status)) {
      pushIssue(issues, 'error', line, 'status は active/standby/stopped/unknown のいずれかです', 'status', row.status)
    }
    if (lat == null) pushIssue(issues, 'error', line, 'lat は数値である必要があります', 'lat', row.lat)
    if (lon == null) pushIssue(issues, 'error', line, 'lon は数値である必要があります', 'lon', row.lon)
    if (id && seenIds.has(id)) {
      pushIssue(issues, 'error', line, 'id が重複しています', 'id', row.id)
    }

    if (!row.updatedAt) pushIssue(issues, 'warning', line, 'updatedAt が空です', 'updatedAt')
    if (!row.note) pushIssue(issues, 'warning', line, 'note が空です', 'note')

    const hasRowError = issues.some((issue) => issue.level === 'error' && issue.line === line)
    if (
      hasRowError ||
      !id ||
      !teamId ||
      !teamName ||
      !title ||
      !activityType ||
      !status ||
      !isTeamStatus(status) ||
      lat == null ||
      lon == null
    ) {
      return
    }

    seenIds.add(id)
    normalized.push({
      id,
      title,
      kind: 'team',
      teamId,
      teamName,
      activityType,
      status,
      lat,
      lon,
      updatedAt: normalizeString(row.updatedAt),
      note: normalizeString(row.note),
      operator: normalizeString(row.operator),
      area: normalizeString(row.area),
    })
  })

  return normalized
}

export async function saveNormalizedDataset(
  datasetType: DatasetType,
  records: NormalizedDatasetRecord[],
  metadata: DatasetPublishMetadataInput = {}
) {
  const regionId = sanitizeRegionId(metadata.regionId) ?? sanitizeRegionId(currentMapRegionConfig.regionId) ?? 'japan'
  const outputPath = getPublishedDatasetFilePath(datasetType, regionId)
  const metadataPath = getPublishedDatasetMetadataFilePath(datasetType, regionId)
  const publishedAt = new Date().toISOString()
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  await fs.writeFile(metadataPath, `${JSON.stringify({
    datasetType,
    regionId,
    updatedBy: normalizeString(metadata.updatedBy),
    updateNote: normalizeString(metadata.updateNote),
    updateCadence: normalizeString(metadata.updateCadence),
    publishedAt,
  }, null, 2)}\n`, 'utf8')
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function readSheltersFromGeoJsonFallback(fallbackPath = SHELTER_GEOJSON_FALLBACK): Promise<ShelterRecord[]> {
  const geojson = await readJsonFile<any>(fallbackPath)
  const features = Array.isArray(geojson?.features) ? geojson.features : []
  return features.flatMap((feature: any, index: number) => {
    const coordinates = feature?.geometry?.coordinates
    if (!Array.isArray(coordinates) || coordinates.length < 2) return []

    const lon = Number(coordinates[0])
    const lat = Number(coordinates[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []

    const props = feature?.properties ?? {}
    const id = normalizeString(props.id) || `shelter-${index + 1}`
    const title = normalizeString(props.title || props.name)
    if (!title) return []

    const capacityRaw = normalizeNumber(props.capacity)
    const capacity = capacityRaw != null && capacityRaw >= 0 ? capacityRaw : null
    const normalizedStatus = normalizeString(props.status)
    const status =
      normalizedStatus === 'open' ||
      normalizedStatus === 'closed' ||
      normalizedStatus === 'full' ||
      normalizedStatus === 'unknown'
        ? normalizedStatus
        : 'unknown'

    return [{
      id: `shelter-${id}`,
      title,
      kind: 'shelter',
      lat,
      lon,
      status,
      address: normalizeString(props.address),
      capacity,
      facilityType: normalizeString(props.facilityType),
      barrierFree: null,
      pets: null,
      updatedAt: null,
      note: normalizeString(props.note),
    }]
  })
}

export async function loadShelterDataset(regionId?: string | null): Promise<ShelterRecord[]> {
  const publishedPath = getPublishedDatasetFilePath('shelters', regionId)
  if (shouldUsePublishedDataset(regionId)) {
    const fromJson = await readJsonFile<ShelterRecord[]>(publishedPath)
    if (Array.isArray(fromJson) && fromJson.length > 0) return fromJson
  } else {
    const fromJson = await readJsonFile<ShelterRecord[]>(publishedPath)
    if (Array.isArray(fromJson) && fromJson.length > 0) return fromJson
  }
  const regionConfig = await loadRegionDatasetConfig(regionId)
  const regionShelters = await readSheltersFromGeoJsonFallback(regionConfig.sheltersFallbackPath)
  if (regionShelters.length > 0) return regionShelters

  // リージョン固有データが空の場合、全国データから県名でフィルタ
  const normalizedRegionId = sanitizeRegionId(regionId) ?? sanitizeRegionId(currentMapRegionConfig.regionId) ?? 'japan'
  if (normalizedRegionId !== 'japan') {
    try {
      const manifestPath = resolvePublicAssetPath(`/regions/${normalizedRegionId}/manifest.json`)
      const manifest = await readJsonFile<{ regionLabel?: string }>(manifestPath)
      const label = normalizeString(manifest?.regionLabel)
      if (label) {
        const japanShelters = await loadShelterDataset('japan')
        return japanShelters.filter((s) => {
          const addr = String(s.address || '')
          return addr.includes(label)
        })
      }
    } catch {
      // フォールバック失敗時は空配列を返す
    }
  }
  return regionShelters
}

export async function loadTeamActivityDataset(regionId?: string | null): Promise<TeamActivityRecord[]> {
  const publishedPath = getPublishedDatasetFilePath('team-activity', regionId)
  if (shouldUsePublishedDataset(regionId)) {
    const fromJson = await readJsonFile<TeamActivityRecord[]>(publishedPath)
    if (Array.isArray(fromJson) && fromJson.length > 0) return fromJson
  } else {
    const fromJson = await readJsonFile<TeamActivityRecord[]>(publishedPath)
    if (Array.isArray(fromJson) && fromJson.length > 0) return fromJson
  }
  const regionConfig = await loadRegionDatasetConfig(regionId)
  const fallback = await readJsonFile<TeamActivityRecord[]>(regionConfig.teamActivityFallbackPath)
  return Array.isArray(fallback) ? fallback : []
}

export async function getDatasetMetadata(
  datasetType: DatasetType,
  regionId?: string | null
): Promise<DatasetMetadata> {
  const normalizedRegionId = sanitizeRegionId(regionId) ?? sanitizeRegionId(currentMapRegionConfig.regionId) ?? 'japan'
  const records = datasetType === 'shelters'
    ? await loadShelterDataset(normalizedRegionId)
    : await loadTeamActivityDataset(normalizedRegionId)
  const outputPath = getPublishedDatasetFilePath(datasetType, normalizedRegionId)
  const metadataPath = getPublishedDatasetMetadataFilePath(datasetType, normalizedRegionId)
  const regionConfig = await loadRegionDatasetConfig(normalizedRegionId)
  const fallbackPath =
    datasetType === 'shelters'
      ? regionConfig.sheltersFallbackPath
      : regionConfig.teamActivityFallbackPath

  let sourcePath = getPublishedDatasetPublicUrl(datasetType, normalizedRegionId)
  let updatedAt: string | null = null

  try {
    const stat = await fs.stat(outputPath)
    updatedAt = stat.mtime.toISOString()
  } catch {
    try {
      const stat = await fs.stat(fallbackPath)
      sourcePath =
        datasetType === 'shelters'
          ? `/${path.relative(resolveProjectPath('../../public'), fallbackPath).replace(/\\/g, '/')}`
          : `/${path.relative(resolveProjectPath('../../public'), fallbackPath).replace(/\\/g, '/')}`
      updatedAt = stat.mtime.toISOString()
    } catch {
      updatedAt = null
    }
  }

  const publishMetadata = await readJsonFile<{
    updatedBy?: string | null
    updateNote?: string | null
    updateCadence?: string | null
    publishedAt?: string | null
  }>(metadataPath)

  return {
    datasetType,
    regionId: normalizedRegionId,
    rowCount: records.length,
    sourcePath,
    updatedAt: publishMetadata?.publishedAt ?? updatedAt,
    updatedBy: normalizeString(publishMetadata?.updatedBy),
    updateNote: normalizeString(publishMetadata?.updateNote),
    updateCadence: normalizeString(publishMetadata?.updateCadence),
  }
}

export async function searchShelters(options: QueryOptions): Promise<ShelterRecord[]> {
  const bbox = parseBBox(options.bbox)
  const query = normalizeString(options.q)?.toLowerCase()
  const status = normalizeString(options.status)?.toLowerCase()
  const facilityType = normalizeString(options.facilityType)?.toLowerCase()
  const prefecture = normalizeString(options.prefecture)

  const filtered = (await loadShelterDataset(options.regionId)).filter((entry) => {
    if (status && entry.status !== status) return false
    if (facilityType && (entry.facilityType || '').toLowerCase() !== facilityType) return false
    if (prefecture && !String(entry.address || '').includes(prefecture)) return false
    if (!matchesBBox(entry.lat, entry.lon, bbox)) return false
    if (!query) return true

    const searchable = [
      entry.title,
      entry.address,
      entry.note,
      entry.facilityType,
      entry.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchable.includes(query)
  })

  if (normalizeString(options.regionId) === 'japan' && bbox && !query) {
    return sampleEvenly(filtered, options.limit)
  }

  return applyLimit(filtered, options.limit)
}

export async function searchTeamActivities(options: QueryOptions): Promise<TeamActivityRecord[]> {
  const bbox = parseBBox(options.bbox)
  const query = normalizeString(options.q)?.toLowerCase()
  const status = normalizeString(options.status)?.toLowerCase()
  const activityType = normalizeString(options.activityType)?.toLowerCase()

  const filtered = (await loadTeamActivityDataset(options.regionId)).filter((entry) => {
    if (status && entry.status !== status) return false
    if (activityType && entry.activityType.toLowerCase() !== activityType) return false
    if (!matchesBBox(entry.lat, entry.lon, bbox)) return false
    if (!query) return true

    const searchable = [
      entry.title,
      entry.teamName,
      entry.teamId,
      entry.operator,
      entry.area,
      entry.note,
      entry.activityType,
      entry.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchable.includes(query)
  })

  return applyLimit(filtered, options.limit)
}
