'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './dashboard.module.css'

const PAGE = 50
const REPUBLISH_DEBOUNCE_MS = 2000
const FIELD_LIMITS = {
  title: 120,
  subtitle: 160,
  address: 240,
  code: 32,
  area: 160,
  operator: 120,
  note: 1000,
  description: 1000,
  activityType: 80,
  teamId: 80,
}

async function triggerRepublish() {
  const res = await fetch('/api/republish', { method: 'POST' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.ok === false) {
    const message = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as { ok: true; mode?: string; clearedCacheEntries?: number }
}

type PublishState = {
  status: 'idle' | 'scheduled' | 'publishing' | 'success' | 'error'
  message: string
}

function useRepublishScheduler() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [publishState, setPublishState] = useState<PublishState>({
    status: 'idle',
    message: '公開データは未更新です',
  })

  const scheduleRepublish = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPublishState({ status: 'scheduled', message: '公開データ更新を予約しました' })
    timerRef.current = setTimeout(async () => {
      timerRef.current = null
      setPublishState({ status: 'publishing', message: '公開データを更新中...' })
      try {
        const result = await triggerRepublish()
        const cleared = typeof result.clearedCacheEntries === 'number'
          ? `（キャッシュ ${result.clearedCacheEntries} 件を無効化）`
          : ''
        setPublishState({ status: 'success', message: `公開データを更新しました${cleared}` })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setPublishState({ status: 'error', message: `公開データ更新に失敗しました: ${message}` })
      }
    }, REPUBLISH_DEBOUNCE_MS)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { publishState, scheduleRepublish }
}

type EvacRow = {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  address: string | null
  status: string
  municipality_code: string | null
  pref_code: string | null
  region_id: string | null
  lod_rank: number | null
  lat: number
  lon: number
  capacity: number | null
  enabled: boolean
}

type TeamRow = {
  id: string
  title: string
  team_id: string | null
  activity_type: string | null
  status: string
  lat: number
  lon: number
  municipality_code: string | null
  district_code: string | null
  area: string | null
  operator: string | null
  note: string | null
  enabled: boolean
}

const BLANK_EVAC: EvacRow = {
  id: '', title: '', subtitle: null, description: null, address: null,
  status: 'unknown', municipality_code: null, pref_code: null,
  region_id: null, lod_rank: null, lat: 0, lon: 0, capacity: null, enabled: true,
}

const BLANK_TEAM: TeamRow = {
  id: '', title: '', team_id: null, activity_type: null,
  status: 'active', lat: 0, lon: 0, municipality_code: null, district_code: null,
  area: null, operator: null, note: null, enabled: true,
}

// ── Evacuation Table ───────────────────────────────────────────
function EvacuationTable() {
  const supabase = useMemo(() => createClient(), [])
  const { publishState, scheduleRepublish } = useRepublishScheduler()
  const [rows, setRows] = useState<EvacRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<EvacRow | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('evacuation_facilities').select('*', { count: 'exact' })
    if (search) q = q.ilike('title', `%${search}%`)
    q = q.order('id').range(page * PAGE, page * PAGE + PAGE - 1)
    const { data, count, error } = await q
    if (!error) {
      setRows((data ?? []) as EvacRow[])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [supabase, page, search])

  useEffect(() => { load() }, [load])

  async function toggleEnabled(row: EvacRow) {
    await supabase.from('evacuation_facilities').update({ enabled: !row.enabled }).eq('id', row.id)
    scheduleRepublish()
    load()
  }

  async function deleteRow(id: string) {
    if (!confirm('この避難所を削除しますか？')) return
    await supabase.from('evacuation_facilities').delete().eq('id', id)
    scheduleRepublish()
    load()
  }

  async function saveEdit(row: EvacRow) {
    setSaveError(null)
    let error
    if (isNew) {
      ;({ error } = await supabase.from('evacuation_facilities').insert(row))
    } else {
      const { id, ...updates } = row
      ;({ error } = await supabase.from('evacuation_facilities').update(updates).eq('id', id))
    }
    if (error) { setSaveError(error.message); return }
    scheduleRepublish()
    setEditing(null)
    setIsNew(false)
    load()
  }

  function openNew() {
    setSaveError(null)
    setIsNew(true)
    setEditing({ ...BLANK_EVAC, id: crypto.randomUUID() })
  }

  function closeModal() {
    setEditing(null)
    setIsNew(false)
    setSaveError(null)
  }

  const totalPages = Math.ceil(total / PAGE)

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="施設名で検索..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
        />
        <span className={styles.count}>{total.toLocaleString()} 件</span>
        <PublishStatus state={publishState} />
        <button className={styles.addBtn} onClick={openNew}>＋ 新規追加</button>
      </div>

      {loading ? (
        <p className={styles.loading}>読み込み中...</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>施設名</th>
                <th>状態</th>
                <th>住所</th>
                <th>収容人数</th>
                <th>自治体コード</th>
                <th>有効</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={!row.enabled ? styles.rowDisabled : ''}>
                  <td className={styles.titleCell}>{row.title}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td className={styles.truncate}>{row.address ?? '—'}</td>
                  <td className={styles.numCell}>{row.capacity?.toLocaleString() ?? '—'}</td>
                  <td className={styles.codeCell}>{row.municipality_code ?? '—'}</td>
                  <td>
                    <button
                      className={`${styles.toggleBtn} ${row.enabled ? styles.toggleOn : styles.toggleOff}`}
                      onClick={() => toggleEnabled(row)}
                    >
                      {row.enabled ? '有効' : '無効'}
                    </button>
                  </td>
                  <td className={styles.actions}>
                    <button className={styles.editBtn} onClick={() => setEditing({ ...row })}>編集</button>
                    <button className={styles.deleteBtn} onClick={() => deleteRow(row.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.pagination}>
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ 前へ</button>
        <span>{page + 1} / {totalPages || 1} ページ</span>
        <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>次へ ›</button>
      </div>

      {editing && (
        <EvacModal
          row={editing}
          isNew={isNew}
          onChange={setEditing}
          onSave={saveEdit}
          onClose={closeModal}
          error={saveError}
        />
      )}
    </div>
  )
}

// ── Evacuation Edit Modal ──────────────────────────────────────
function EvacModal({ row, isNew, onChange, onSave, onClose, error }: {
  row: EvacRow
  isNew: boolean
  onChange: (r: EvacRow) => void
  onSave: (r: EvacRow) => void
  onClose: () => void
  error: string | null
}) {
  const set = (key: keyof EvacRow, val: unknown) => onChange({ ...row, [key]: val })
  const numOrNull = (v: string) => v === '' ? null : Number(v)

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <h2 className={styles.modalTitle}>{isNew ? '避難所を追加' : '避難所を編集'}</h2>
        <div className={styles.modalGrid}>
          <TextField label="施設名" value={row.title} maxLength={FIELD_LIMITS.title} onChange={v => set('title', v)} />
          <TextField label="サブタイトル" value={row.subtitle ?? ''} maxLength={FIELD_LIMITS.subtitle} onChange={v => set('subtitle', v || null)} />
          <TextField label="住所" value={row.address ?? ''} maxLength={FIELD_LIMITS.address} onChange={v => set('address', v || null)} />
          <label className={styles.field}>
            <span>状態</span>
            <select value={row.status} onChange={e => set('status', e.target.value)}>
              {['unknown', 'open', 'crowded', 'full', 'closed'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>収容人数</span>
            <input type="number" value={row.capacity ?? ''} onChange={e => set('capacity', numOrNull(e.target.value))} />
          </label>
          <label className={styles.field}>
            <span>緯度</span>
            <input type="number" step="any" value={row.lat} onChange={e => set('lat', Number(e.target.value))} />
          </label>
          <label className={styles.field}>
            <span>経度</span>
            <input type="number" step="any" value={row.lon} onChange={e => set('lon', Number(e.target.value))} />
          </label>
          <TextField label="自治体コード" value={row.municipality_code ?? ''} maxLength={FIELD_LIMITS.code} onChange={v => set('municipality_code', v || null)} />
          <TextField label="都道府県コード" value={row.pref_code ?? ''} maxLength={FIELD_LIMITS.code} onChange={v => set('pref_code', v || null)} />
          <TextField label="地域ID" value={row.region_id ?? ''} maxLength={FIELD_LIMITS.code} onChange={v => set('region_id', v || null)} />
          <label className={styles.field}>
            <span>LODランク</span>
            <input type="number" value={row.lod_rank ?? ''} onChange={e => set('lod_rank', numOrNull(e.target.value))} />
          </label>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>説明</span>
            <textarea rows={3} maxLength={FIELD_LIMITS.description} value={row.description ?? ''} onChange={e => set('description', e.target.value || null)} />
          </label>
          <label className={`${styles.field} ${styles.fieldCheck}`}>
            <input type="checkbox" checked={row.enabled} onChange={e => set('enabled', e.target.checked)} />
            <span>有効</span>
          </label>
        </div>
        {error && <p className={styles.formError}>{error}</p>}
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
          <button className={styles.saveBtn} onClick={() => onSave(row)}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ── Team Activity Table ────────────────────────────────────────
type RegionOption = { id: string; label: string }
type MunicipalityOption = { id: string; label: string; code: string }
type DistrictOption = {
  label: string
  display: string
  municipalityCode: string
  districtCode: string
  lat: number
  lon: number
}

const stableHash = (value: string) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const makeDistrictCode = (label: string, municipalityCode: string, lat?: number, lon?: number) =>
  `district:${municipalityCode}:${stableHash(`${label}:${lat ?? ''}:${lon ?? ''}`)}`

const blankTeamForDistrict = (district: DistrictOption): TeamRow => ({
  ...BLANK_TEAM,
  id: `team:${district.districtCode}`,
  title: district.display,
  team_id: district.districtCode,
  municipality_code: district.municipalityCode,
  district_code: district.districtCode,
  area: district.label,
  lat: district.lat,
  lon: district.lon,
  enabled: false,
})

function TeamActivityTable() {
  const supabase = useMemo(() => createClient(), [])
  const { publishState, scheduleRepublish } = useRepublishScheduler()
  const [regions, setRegions] = useState<RegionOption[]>([])
  const [municipalities, setMunicipalities] = useState<MunicipalityOption[]>([])
  const [districts, setDistricts] = useState<DistrictOption[]>([])
  const [selectedRegion, setSelectedRegion] = useState('okayama')
  const [selectedMunicipality, setSelectedMunicipality] = useState('')
  const [rows, setRows] = useState<TeamRow[]>([])
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/map/regions/index.json')
        const data = await res.json()
        const loaded: RegionOption[] = (data.regions ?? []).map((r: { id: string; label?: string }) => ({
          id: r.id,
          label: r.label ?? r.id,
        }))
        if (cancelled) return
        setRegions(loaded)
        if (!loaded.some(r => r.id === selectedRegion) && loaded[0]) {
          setSelectedRegion(loaded[0].id)
        }
      } catch {
        if (!cancelled) setRegions([{ id: 'okayama', label: '岡山県' }])
      }
    })()
    return () => { cancelled = true }
  }, [selectedRegion])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setMunicipalities([])
      setDistricts([])
      setSelectedMunicipality('')
      setSearch('')
      try {
        const [muniRes, districtRes] = await Promise.all([
          fetch(`/map/regions/${selectedRegion}/municipalities.json`),
          fetch(`/data/${selectedRegion}/districts-index.json`),
        ])
        const muniData = await muniRes.json()
        const nextMunicipalities: MunicipalityOption[] = (muniData.municipalities ?? [])
          .map((m: { id: string; label: string; displayCode?: string; municipalityCodes?: string[] }) => ({
            id: m.id,
            label: m.label,
            code: m.displayCode || m.municipalityCodes?.[0] || m.id,
          }))
        const municipalityByCode = new Map(nextMunicipalities.map(m => [m.code, m.label]))
        const rawDistricts: Array<{ label: string; code: string; districtCode?: string; lat: number; lon: number }> =
          districtRes.ok ? await districtRes.json() : []
        const nextDistricts = rawDistricts
          .filter(d => d.label && d.code)
          .map((d): DistrictOption => {
            const municipalityLabel = municipalityByCode.get(d.code)
            const display = municipalityLabel && d.label.startsWith(`${municipalityLabel} `)
              ? d.label.slice(municipalityLabel.length + 1)
              : d.label.split(' ').slice(-1)[0] || d.label
            return {
              label: d.label,
              display,
              municipalityCode: d.code,
              districtCode: d.districtCode || makeDistrictCode(d.label, d.code, d.lat, d.lon),
              lat: d.lat,
              lon: d.lon,
            }
          })
        if (cancelled) return
        setMunicipalities(nextMunicipalities)
        setDistricts(nextDistricts)
        setSelectedMunicipality(nextMunicipalities[0]?.code ?? '')
      } catch {
        if (!cancelled) {
          setMunicipalities([])
          setDistricts([])
        }
      }
    })()
    return () => { cancelled = true }
  }, [selectedRegion])

  const loadRows = useCallback(async () => {
    if (!selectedMunicipality) {
      setRows([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('team_activities')
      .select('*')
      .eq('municipality_code', selectedMunicipality)
      .order('area')
      .order('title')
    if (!error) {
      setRows((data ?? []) as TeamRow[])
      setDirtyIds(new Set())
    }
    setLoading(false)
  }, [selectedMunicipality, supabase])

  useEffect(() => { loadRows() }, [loadRows])

  const selectedMuniDistricts = useMemo(
    () => districts.filter(d => d.municipalityCode === selectedMunicipality),
    [districts, selectedMunicipality],
  )

  const gridRows = useMemo(() => {
    const byDistrict = new Map<string, TeamRow>()
    const byArea = new Map<string, TeamRow>()
    for (const row of rows) {
      if (row.district_code) byDistrict.set(row.district_code, row)
      if (row.area) byArea.set(nospace(row.area), row)
    }

    const usedIds = new Set<string>()
    const districtRows = selectedMuniDistricts.map((district) => {
      const matched = byDistrict.get(district.districtCode) ?? byArea.get(nospace(district.label))
      if (!matched) return blankTeamForDistrict(district)
      usedIds.add(matched.id)
      return {
        ...blankTeamForDistrict(district),
        ...matched,
        municipality_code: matched.municipality_code || district.municipalityCode,
        district_code: matched.district_code || district.districtCode,
        area: matched.area || district.label,
        lat: Number.isFinite(Number(matched.lat)) ? Number(matched.lat) : district.lat,
        lon: Number.isFinite(Number(matched.lon)) ? Number(matched.lon) : district.lon,
      }
    })

    const unmatchedRows = rows.filter(row => !usedIds.has(row.id))
    return [...unmatchedRows, ...districtRows]
  }, [rows, selectedMuniDistricts])

  const visibleRows = useMemo(() => {
    const q = nospace(search.trim())
    if (q.length < 1) return gridRows
    return gridRows.filter(row => {
      const haystack = [
        row.area,
        row.title,
        row.status,
        row.activity_type,
        row.operator,
        row.team_id,
        row.note,
        row.district_code,
        row.municipality_code,
      ].filter(Boolean).join(' ')
      return nospace(haystack).includes(q)
    })
  }, [gridRows, search])

  function updateRow(baseRow: TeamRow, patch: Partial<TeamRow>) {
    const nextRow = { ...baseRow, ...patch }
    setRows(current => {
      const exists = current.some(row => row.id === baseRow.id)
      if (exists) return current.map(row => row.id === baseRow.id ? nextRow : row)
      return [nextRow, ...current]
    })
    setDirtyIds(current => new Set(current).add(baseRow.id))
  }

  async function saveRow(row: TeamRow) {
    setSaveError(null)
    const payload: TeamRow = {
      ...row,
      title: row.title.trim() || row.area || row.id,
      municipality_code: row.municipality_code || selectedMunicipality,
      district_code: row.district_code || null,
      activity_type: row.activity_type || null,
      team_id: row.team_id || null,
      area: row.area || null,
      operator: row.operator || null,
      note: row.note || null,
      lat: Number(row.lat),
      lon: Number(row.lon),
    }
    const { error } = await supabase.from('team_activities').upsert(payload, { onConflict: 'id' })
    if (error) {
      setSaveError(error.message)
      return
    }
    setDirtyIds(current => {
      const next = new Set(current)
      next.delete(row.id)
      return next
    })
    scheduleRepublish()
    loadRows()
  }

  async function deleteRow(row: TeamRow) {
    if (!confirm('このチーム活動を削除しますか？')) return
    setSaveError(null)
    const { error } = await supabase.from('team_activities').delete().eq('id', row.id)
    if (error) {
      setSaveError(error.message)
      return
    }
    scheduleRepublish()
    loadRows()
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <label className={styles.compactField}>
          <span>県</span>
          <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}>
            {regions.map(region => <option key={region.id} value={region.id}>{region.label}</option>)}
          </select>
        </label>
        <label className={styles.compactField}>
          <span>市区町村</span>
          <select value={selectedMunicipality} onChange={e => setSelectedMunicipality(e.target.value)}>
            {municipalities.map(muni => <option key={muni.id} value={muni.code}>{muni.label}</option>)}
          </select>
        </label>
        <span className={styles.count}>
          有効 {rows.filter(row => row.enabled).length.toLocaleString()} 件 / 表示 {visibleRows.length.toLocaleString()} 行
        </span>
        <PublishStatus state={publishState} />
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          placeholder="地区名・表示名・担当・種別で検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {saveError && <p className={styles.formError}>{saveError}</p>}

      {loading ? (
        <p className={styles.loading}>読み込み中...</p>
      ) : !selectedMunicipality ? (
        <p className={styles.empty}>市区町村を選択してください。</p>
      ) : visibleRows.length === 0 ? (
        <p className={styles.empty}>
          {search ? '検索に一致する地区がありません。' : 'この市区町村の地区データがありません。'}
        </p>
      ) : (
        <div className={`${styles.tableWrap} ${styles.gridTableWrap}`}>
          <table className={`${styles.table} ${styles.editGrid}`}>
            <colgroup>
              <col className={styles.colDistrict} />
              <col className={styles.colName} />
              <col className={styles.colStatus} />
              <col className={styles.colType} />
              <col className={styles.colOperator} />
              <col className={styles.colNote} />
              <col className={styles.colCoord} />
              <col className={styles.colCoord} />
              <col className={styles.colToggle} />
              <col className={styles.colActions} />
            </colgroup>
            <thead>
              <tr>
                <th>地区</th>
                <th>表示名</th>
                <th>状態</th>
                <th>種別</th>
                <th>担当</th>
                <th>メモ</th>
                <th>緯度</th>
                <th>経度</th>
                <th>有効</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => {
                const dirty = dirtyIds.has(row.id)
                const persisted = rows.some(existing => existing.id === row.id)
                const rowClass = [
                  !persisted ? styles.rowGhost : '',
                  persisted && !row.enabled ? styles.rowDisabled : '',
                  dirty ? styles.rowDirty : '',
                ].filter(Boolean).join(' ')
                return (
                  <tr key={row.id} className={rowClass}>
                    <td className={styles.districtCell}>
                      <span className={styles.districtName}>{row.area ?? '—'}</span>
                      {!persisted
                        ? <span className={styles.unassignedTag}>未割当</span>
                        : <span className={styles.inlineMeta}>{row.district_code || row.municipality_code || ''}</span>}
                    </td>
                    <td><input className={styles.cellInput} placeholder="表示名" value={row.title} maxLength={FIELD_LIMITS.title} onChange={e => updateRow(row, { title: e.target.value })} /></td>
                    <td>
                      <select
                        className={`${styles.cellInput} ${styles.statusSelect} ${styles[`status_${row.status}`] ?? ''}`}
                        value={row.status}
                        onChange={e => updateRow(row, { status: e.target.value })}
                      >
                        {['active', 'standby', 'completed', 'inactive'].map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td><input className={styles.cellInput} placeholder="—" value={row.activity_type ?? ''} maxLength={FIELD_LIMITS.activityType} onChange={e => updateRow(row, { activity_type: e.target.value || null })} /></td>
                    <td><input className={styles.cellInput} placeholder="—" value={row.operator ?? ''} maxLength={FIELD_LIMITS.operator} onChange={e => updateRow(row, { operator: e.target.value || null })} /></td>
                    <td><input className={styles.cellInput} placeholder="—" value={row.note ?? ''} maxLength={FIELD_LIMITS.note} onChange={e => updateRow(row, { note: e.target.value || null })} /></td>
                    <td><input className={`${styles.cellInput} ${styles.coordInput}`} type="number" value={row.lat} step="0.00001" onChange={e => updateRow(row, { lat: Number(e.target.value) })} /></td>
                    <td><input className={`${styles.cellInput} ${styles.coordInput}`} type="number" value={row.lon} step="0.00001" onChange={e => updateRow(row, { lon: Number(e.target.value) })} /></td>
                    <td className={styles.toggleCell}>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={e => {
                          const next = { ...row, enabled: e.target.checked }
                          updateRow(row, { enabled: e.target.checked })
                          saveRow(next)
                        }}
                      />
                    </td>
                    <td className={styles.actions}>
                      <button className={styles.saveRowBtn} disabled={!dirty} onClick={() => saveRow(row)}>保存</button>
                      <button className={styles.deleteBtn} disabled={!persisted} onClick={() => deleteRow(row)}>削除</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


const nospace = (s: string) => s.replace(/\s+/g, '')


// ── Shared helpers ─────────────────────────────────────────────
function TextField({
  label,
  value,
  maxLength,
  onChange,
}: {
  label: string
  value: string
  maxLength?: number
  onChange: (v: string) => void
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input type="text" value={value} maxLength={maxLength} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

const STATUS_COLOR: Record<string, string> = {
  open:      '#16a34a',
  active:    '#16a34a',
  crowded:   '#d97706',
  standby:   '#d97706',
  full:      '#dc2626',
  closed:    '#dc2626',
  completed: '#6366f1',
  inactive:  '#94a3b8',
  unknown:   '#94a3b8',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#94a3b8'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '0.72rem',
      fontWeight: 600,
      color: '#fff',
      background: color,
    }}>
      {status}
    </span>
  )
}

function PublishStatus({ state }: { state: PublishState }) {
  if (state.status === 'idle') return null
  return (
    <span className={`${styles.publishStatus} ${styles[`publishStatus_${state.status}`]}`}>
      {state.message}
    </span>
  )
}

// ── Root ───────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab, setTab] = useState<'evacuation' | 'team'>('evacuation')
  return (
    <main className={styles.main}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'evacuation' ? styles.tabActive : ''}`}
          onClick={() => setTab('evacuation')}
        >
          避難所
        </button>
        <button
          className={`${styles.tab} ${tab === 'team' ? styles.tabActive : ''}`}
          onClick={() => setTab('team')}
        >
          チーム活動
        </button>
        <a href="/map" className={styles.backToMap}>← 地図へ戻る</a>
      </div>
      {tab === 'evacuation' ? <EvacuationTable /> : <TeamActivityTable />}
    </main>
  )
}
