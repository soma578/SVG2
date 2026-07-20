'use client'

import { useMemo, useState } from 'react'
import styles from './workbench.module.css'

type CsvRow = Record<string, string>
type PropertySpec = { name: string; column: string; type: 'string' | 'number' | 'boolean' | 'json' }

type SaveResult = {
  ok: boolean
  layerId?: string
  slug?: string
  files?: string[]
  nextCommands?: string[]
  error?: string
}

const parseCsv = (text: string) => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
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
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  const [headerRow, ...dataRows] = rows.filter((entry) => entry.some((value) => value.trim() !== ''))
  const headers = (headerRow || []).map((value) => value.trim()).filter(Boolean)
  const records = dataRows.slice(0, 20).map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] || ''])))
  return { headers, records }
}

const slugify = (value: string) => value
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64)

const inferColumn = (headers: string[], candidates: string[]) => {
  const lower = new Map(headers.map((header) => [header.toLowerCase(), header]))
  for (const candidate of candidates) {
    const found = lower.get(candidate.toLowerCase())
    if (found) return found
  }
  return ''
}

const SelectColumn = ({
  label,
  value,
  headers,
  required = false,
  onChange,
}: {
  label: string
  value: string
  headers: string[]
  required?: boolean
  onChange: (value: string) => void
}) => (
  <label className={styles.field}>
    <span>{label}{required ? ' *' : ''}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">未指定</option>
      {headers.map((header) => <option key={header} value={header}>{header}</option>)}
    </select>
  </label>
)

export default function LayerWorkbench() {
  const [csvText, setCsvText] = useState('')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [group, setGroup] = useState('生成レイヤー')
  const [symbol, setSymbol] = useState('層')
  const [color, setColor] = useState('#2563eb')
  const [visibility, setVisibility] = useState<'visible' | 'hidden'>('hidden')
  const [columns, setColumns] = useState({
    idColumn: '',
    titleColumn: '',
    latitudeColumn: '',
    longitudeColumn: '',
    regionColumn: '',
    prefCodeColumn: '',
    municipalityCodeColumn: '',
    statusColumn: '',
    addressColumn: '',
    summaryColumn: '',
    descriptionColumn: '',
    areaColumn: '',
    operatorColumn: '',
  })
  const [properties, setProperties] = useState<PropertySpec[]>([])
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<SaveResult | null>(null)

  const parsed = useMemo(() => parseCsv(csvText.replace(/^\uFEFF/, '')), [csvText])
  const headers = parsed.headers
  const sampleRows = parsed.records

  async function loadFile(file: File) {
    const text = await file.text()
    setCsvText(text)
    const parsedFile = parseCsv(text.replace(/^\uFEFF/, ''))
    const nextTitle = title || file.name.replace(/\.[^.]+$/, '')
    setTitle(nextTitle)
    setSlug((current) => current || slugify(nextTitle))
    setColumns({
      idColumn: inferColumn(parsedFile.headers, ['id', 'ID']),
      titleColumn: inferColumn(parsedFile.headers, ['title', 'name', '名称', '名前']),
      latitudeColumn: inferColumn(parsedFile.headers, ['lat', 'latitude', '緯度']),
      longitudeColumn: inferColumn(parsedFile.headers, ['lon', 'lng', 'longitude', '経度']),
      regionColumn: inferColumn(parsedFile.headers, ['regionId', 'region_id']),
      prefCodeColumn: inferColumn(parsedFile.headers, ['prefCode', 'pref_code', '都道府県コード']),
      municipalityCodeColumn: inferColumn(parsedFile.headers, ['municipalityCode', 'municipality_code', '自治体コード']),
      statusColumn: inferColumn(parsedFile.headers, ['status', '状態']),
      addressColumn: inferColumn(parsedFile.headers, ['address', '住所']),
      summaryColumn: inferColumn(parsedFile.headers, ['summary', '概要']),
      descriptionColumn: inferColumn(parsedFile.headers, ['description', '説明', '備考']),
      areaColumn: inferColumn(parsedFile.headers, ['area', '地区']),
      operatorColumn: inferColumn(parsedFile.headers, ['operator', '運営者']),
    })
    setResult(null)
  }

  function addProperty(column = '') {
    const name = column
      .replace(/[^A-Za-z0-9_]+/g, '_')
      .replace(/^[^A-Za-z]+/, '')
      .slice(0, 48) || `property${properties.length + 1}`
    setProperties((current) => [...current, { name, column, type: 'string' }])
  }

  function updateProperty(index: number, patch: Partial<PropertySpec>) {
    setProperties((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  async function saveLayer() {
    setSaving(true)
    setResult(null)
    const propertyColumns = Object.fromEntries(
      properties
        .filter((property) => property.name && property.column)
        .map((property) => [property.name, { column: property.column, type: property.type }]),
    )
    try {
      const response = await fetch('/api/layer-workbench', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title,
          group,
          symbol,
          color,
          visibility,
          csvText,
          mapping: { ...columns, propertyColumns },
        }),
      })
      const body = await response.json().catch(() => ({})) as SaveResult
      setResult({ ...body, ok: response.ok && body.ok !== false })
    } catch (error) {
      setResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setSaving(false)
    }
  }

  const canSave = csvText.trim() && title.trim() && slug.trim() && columns.latitudeColumn && columns.longitudeColumn

  return (
    <main className={styles.main}>
      <section className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>SVGMap Layer Workbench</p>
          <h1>CSVからportableな地図レイヤーを生成</h1>
        </div>
        <p>
          生成UIはNext.js上にありますが、出力は `map/layers/managed/*` の
          `layer.config.json` と `data.csv` です。閲覧者ブラウザが外部データ元を直接叩く構成にはしません。
        </p>
      </section>

      <section className={styles.panel}>
        <h2>1. CSV</h2>
        <input
          className={styles.file}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void loadFile(file)
          }}
        />
        {headers.length > 0 && (
          <p className={styles.muted}>{headers.length}列 / プレビュー {sampleRows.length}行</p>
        )}
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <h2>2. レイヤー情報</h2>
          <label className={styles.field}>
            <span>レイヤー名 *</span>
            <input value={title} onChange={(event) => {
              setTitle(event.target.value)
              if (!slug) setSlug(slugify(event.target.value))
            }} />
          </label>
          <label className={styles.field}>
            <span>slug *</span>
            <input value={slug} onChange={(event) => setSlug(slugify(event.target.value))} placeholder="sample-layer" />
          </label>
          <label className={styles.field}>
            <span>グループ</span>
            <input value={group} onChange={(event) => setGroup(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>記号</span>
            <input value={symbol} maxLength={2} onChange={(event) => setSymbol(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>基本色</span>
            <span className={styles.colorControl}>
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
              <input value={color} onChange={(event) => setColor(event.target.value)} />
              <span className={styles.pinPreview} style={{ background: color }}>{Array.from(symbol || '層')[0]}</span>
            </span>
          </label>
          <label className={styles.field}>
            <span>初期表示</span>
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as 'visible' | 'hidden')}>
              <option value="hidden">非表示</option>
              <option value="visible">表示</option>
            </select>
          </label>
        </div>

        <div className={styles.panel}>
          <h2>3. 列対応</h2>
          <SelectColumn label="緯度" value={columns.latitudeColumn} headers={headers} required onChange={(value) => setColumns((c) => ({ ...c, latitudeColumn: value }))} />
          <SelectColumn label="経度" value={columns.longitudeColumn} headers={headers} required onChange={(value) => setColumns((c) => ({ ...c, longitudeColumn: value }))} />
          <SelectColumn label="タイトル" value={columns.titleColumn} headers={headers} onChange={(value) => setColumns((c) => ({ ...c, titleColumn: value }))} />
          <SelectColumn label="ID" value={columns.idColumn} headers={headers} onChange={(value) => setColumns((c) => ({ ...c, idColumn: value }))} />
          <SelectColumn label="地域ID" value={columns.regionColumn} headers={headers} onChange={(value) => setColumns((c) => ({ ...c, regionColumn: value }))} />
          <SelectColumn label="都道府県コード" value={columns.prefCodeColumn} headers={headers} onChange={(value) => setColumns((c) => ({ ...c, prefCodeColumn: value }))} />
          <SelectColumn label="状態" value={columns.statusColumn} headers={headers} onChange={(value) => setColumns((c) => ({ ...c, statusColumn: value }))} />
          <SelectColumn label="住所" value={columns.addressColumn} headers={headers} onChange={(value) => setColumns((c) => ({ ...c, addressColumn: value }))} />
          <SelectColumn label="概要" value={columns.summaryColumn} headers={headers} onChange={(value) => setColumns((c) => ({ ...c, summaryColumn: value }))} />
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2>4. レイヤー固有属性</h2>
          <button type="button" onClick={() => addProperty(headers.find((header) => !Object.values(columns).includes(header)) || '')}>属性を追加</button>
        </div>
        {properties.length === 0 ? (
          <p className={styles.muted}>詳細画面や検索に使いたい追加列があれば、propertiesとして通します。</p>
        ) : (
          <div className={styles.properties}>
            {properties.map((property, index) => (
              <div className={styles.propertyRow} key={`${property.name}-${index}`}>
                <input value={property.name} onChange={(event) => updateProperty(index, { name: event.target.value })} placeholder="propertyName" />
                <select value={property.column} onChange={(event) => updateProperty(index, { column: event.target.value })}>
                  <option value="">列</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
                <select value={property.type} onChange={(event) => updateProperty(index, { type: event.target.value as PropertySpec['type'] })}>
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="json">json</option>
                </select>
                <button type="button" onClick={() => setProperties((current) => current.filter((_, i) => i !== index))}>削除</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {sampleRows.length > 0 && (
        <section className={styles.panel}>
          <h2>プレビュー</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>{headers.slice(0, 8).map((header) => <th key={header}>{header}</th>)}</tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 6).map((row: CsvRow, index) => (
                  <tr key={index}>
                    {headers.slice(0, 8).map((header) => <td key={header}>{row[header]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={styles.actions}>
        <button type="button" disabled={!canSave || saving} onClick={() => void saveLayer()}>
          {saving ? '保存中...' : 'managed layerを生成'}
        </button>
        <span>保存後は既存の `map:build` パイプラインでQTCT / Container / catalogを生成します。</span>
      </section>

      {result && (
        <section className={result.ok ? styles.resultOk : styles.resultError}>
          {result.ok ? (
            <>
              <strong>{result.layerId} を作成しました</strong>
              <ul>{result.files?.map((file) => <li key={file}>{file}</li>)}</ul>
              <p>次に実行:</p>
              <code>{result.nextCommands?.join(' && ')}</code>
            </>
          ) : (
            <strong>{result.error || '保存に失敗しました'}</strong>
          )}
        </section>
      )}
    </main>
  )
}
