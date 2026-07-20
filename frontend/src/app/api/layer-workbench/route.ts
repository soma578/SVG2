import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CsvLayerRequest = {
  slug?: string
  title?: string
  group?: string
  symbol?: string
  color?: string
  visibility?: 'visible' | 'hidden'
  csvText?: string
  mapping?: {
    idColumn?: string
    titleColumn?: string
    latitudeColumn?: string
    longitudeColumn?: string
    regionColumn?: string
    prefCodeColumn?: string
    municipalityCodeColumn?: string
    statusColumn?: string
    addressColumn?: string
    summaryColumn?: string
    descriptionColumn?: string
    areaColumn?: string
    operatorColumn?: string
    propertyColumns?: Record<string, { column: string; type: 'string' | 'number' | 'boolean' | 'json' }>
  }
}

const projectRoot = resolve(process.cwd(), '..')
const managedRoot = join(projectRoot, 'map', 'layers', 'managed')

const segmentPattern = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/
const columnPattern = /^[A-Za-z0-9_.:-]+$/
const propertyPattern = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const propertyTypes = new Set(['string', 'number', 'boolean', 'json'])

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

function isSameOriginRequest(request: Request) {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  if (origin && origin !== expectedOrigin) return false
  const referer = request.headers.get('referer')
  if (!referer) return true
  try {
    return new URL(referer).origin === expectedOrigin
  } catch {
    return false
  }
}

function parseCsvHeader(text: string) {
  let cell = ''
  let quoted = false
  const headers: string[] = []
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') quoted = false
      else cell += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      headers.push(cell.trim())
      cell = ''
    } else if (char === '\n' || char === '\r') {
      headers.push(cell.trim())
      return headers.filter(Boolean)
    } else cell += char
  }
  if (cell.trim()) headers.push(cell.trim())
  return headers.filter(Boolean)
}

function assertColumn(headers: Set<string>, label: string, column?: string, required = false) {
  const value = String(column || '').trim()
  if (!value) {
    if (required) throw new Error(`${label} is required`)
    return ''
  }
  if (!headers.has(value)) throw new Error(`${label} column "${value}" is not in CSV`)
  return value
}

function cleanSymbol(value: unknown) {
  const text = String(value || '').trim()
  return Array.from(text)[0] || '層'
}

function cleanColor(value: unknown) {
  const text = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#2563eb'
}

function cleanColumnName(value: string) {
  return value.trim().replaceAll(/\s+/g, '_').replaceAll(/[^A-Za-z0-9_.:-]/g, '_')
}

function layerConfigFor(body: CsvLayerRequest, headers: Set<string>) {
  const slug = String(body.slug || '').trim().toLowerCase()
  if (!segmentPattern.test(slug)) throw new Error('slug must be 3-64 chars: lowercase letters, numbers, hyphen')
  const title = String(body.title || '').trim()
  if (!title) throw new Error('title is required')
  const qtctLayer = slug.replaceAll(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
  const mapping = body.mapping || {}
  const symbol = cleanSymbol(body.symbol)
  const color = cleanColor(body.color)
  const latitudeColumn = assertColumn(headers, 'latitudeColumn', mapping.latitudeColumn, true)
  const longitudeColumn = assertColumn(headers, 'longitudeColumn', mapping.longitudeColumn, true)
  const propertyColumns: Record<string, { column: string; type: string }> = {}
  for (const [rawName, rawSpec] of Object.entries(mapping.propertyColumns || {})) {
    const propertyName = cleanColumnName(rawName)
    if (!propertyPattern.test(propertyName)) throw new Error(`invalid property name "${rawName}"`)
    const column = assertColumn(headers, `propertyColumns.${propertyName}`, rawSpec.column, true)
    const type = rawSpec.type || 'string'
    if (!propertyTypes.has(type)) throw new Error(`propertyColumns.${propertyName} has invalid type "${type}"`)
    propertyColumns[propertyName] = { column, type }
  }
  const build: Record<string, unknown> = {
    kind: 'csv-qtct',
    source: 'data.csv',
    qtctLayer,
    idColumn: assertColumn(headers, 'idColumn', mapping.idColumn) || undefined,
    titleColumn: assertColumn(headers, 'titleColumn', mapping.titleColumn) || undefined,
    latitudeColumn,
    longitudeColumn,
    regionColumn: assertColumn(headers, 'regionColumn', mapping.regionColumn) || undefined,
    prefCodeColumn: assertColumn(headers, 'prefCodeColumn', mapping.prefCodeColumn) || undefined,
    municipalityCodeColumn: assertColumn(headers, 'municipalityCodeColumn', mapping.municipalityCodeColumn) || undefined,
    statusColumn: assertColumn(headers, 'statusColumn', mapping.statusColumn) || undefined,
    addressColumn: assertColumn(headers, 'addressColumn', mapping.addressColumn) || undefined,
    summaryColumn: assertColumn(headers, 'summaryColumn', mapping.summaryColumn) || undefined,
    descriptionColumn: assertColumn(headers, 'descriptionColumn', mapping.descriptionColumn) || undefined,
    areaColumn: assertColumn(headers, 'areaColumn', mapping.areaColumn) || undefined,
    operatorColumn: assertColumn(headers, 'operatorColumn', mapping.operatorColumn) || undefined,
    defaultStatus: 'unknown',
  }
  for (const key of Object.keys(build)) {
    if (build[key] === undefined || build[key] === '') delete build[key]
  }
  if (Object.keys(propertyColumns).length > 0) build.propertyColumns = propertyColumns
  return {
    id: `layer-${slug}`,
    title,
    href: `/map/layers/portable/representative-pins/representativePinsPortable.svg#summary=/map/data/qtct/${qtctLayer}/summary.json&data=/map/data/qtct/${qtctLayer}/{regionId}/detail.json&layer=${qtctLayer}`,
    class: 'poi clickable',
    visibility: body.visibility === 'visible' ? 'visible' : 'hidden',
    opacity: '1',
    order: 900,
    ui: {
      catalog: true,
      group: String(body.group || '').trim() || '生成レイヤー',
      symbol,
      kind: 'poi',
      note: '生成ページから作成したCSV/QTCTレイヤー',
      pinProfile: {
        label: title,
        symbol,
        color,
        iconMode: 'generated',
        statusAliases: {
          normal: ['normal', 'active', 'available', 'open', '平常', '通常'],
          warning: ['warning', 'alert', 'limited', '注意', '警戒', '要確認'],
          closed: ['closed', 'inactive', '停止', '閉鎖', '終了'],
          unknown: ['unknown', '不明', '欠測'],
        },
        defaultStatus: 'normal',
        statusColors: {
          normal: color,
          warning: '#d97706',
          closed: '#64748b',
          unknown: '#475569',
        },
        representativeStatus: null,
        placement: 'point',
        individualKind: 'poi',
      },
    },
    build,
    portable: {
      entrypoint: '/map/layers/portable/representative-pins/representativePinsPortable.svg',
      shareable: true,
      detailMode: 'svgMap.showModal',
    },
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return jsonError('forbidden', 403)
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return jsonError('unauthorized', 401)

    const body = await request.json() as CsvLayerRequest
    const csvText = String(body.csvText || '').replace(/^\uFEFF/, '')
    if (!csvText.trim()) return jsonError('csvText is required')
    if (csvText.length > 5_000_000) return jsonError('CSV is too large for this MVP')
    const headers = new Set(parseCsvHeader(csvText))
    if (headers.size === 0) return jsonError('CSV header is empty')
    const config = layerConfigFor(body, headers)
    const slug = String(body.slug || '').trim().toLowerCase()
    const outDir = join(managedRoot, slug)
    const existingConfig = join(outDir, 'layer.config.json')
    if (existsSync(existingConfig)) return jsonError(`layer already exists: ${slug}`, 409)

    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'data.csv'), csvText.endsWith('\n') ? csvText : `${csvText}\n`, 'utf8')
    await writeFile(existingConfig, `${JSON.stringify(config, null, 2)}\n`, 'utf8')

    return NextResponse.json({
      ok: true,
      layerId: config.id,
      slug,
      files: [
        `map/layers/managed/${slug}/data.csv`,
        `map/layers/managed/${slug}/layer.config.json`,
      ],
      nextCommands: [
        'npm run layers:check',
        'npm run layers:build',
        'npm run containers:generate',
        'npm run assets:prepare',
        'npm run containers:check',
      ],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(message)
  }
}
