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
  status: 'active', lat: 0, lon: 0, municipality_code: null,
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
function TeamActivityTable() {
  const supabase = useMemo(() => createClient(), [])
  const { publishState, scheduleRepublish } = useRepublishScheduler()
  const [rows, setRows] = useState<TeamRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TeamRow | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('team_activities').select('*', { count: 'exact' })
    if (search) q = q.ilike('title', `%${search}%`)
    q = q.order('id').range(page * PAGE, page * PAGE + PAGE - 1)
    const { data, count, error } = await q
    if (!error) {
      setRows((data ?? []) as TeamRow[])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [supabase, page, search])

  useEffect(() => { load() }, [load])

  async function toggleEnabled(row: TeamRow) {
    await supabase.from('team_activities').update({ enabled: !row.enabled }).eq('id', row.id)
    scheduleRepublish()
    load()
  }

  async function deleteRow(id: string) {
    if (!confirm('このチーム活動を削除しますか？')) return
    await supabase.from('team_activities').delete().eq('id', id)
    scheduleRepublish()
    load()
  }

  async function saveEdit(row: TeamRow) {
    setSaveError(null)
    let error
    if (isNew) {
      ;({ error } = await supabase.from('team_activities').insert(row))
    } else {
      const { id, ...updates } = row
      ;({ error } = await supabase.from('team_activities').update(updates).eq('id', id))
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
    setEditing({ ...BLANK_TEAM, id: crypto.randomUUID() })
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
          placeholder="チーム名で検索..."
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
                <th>チーム名</th>
                <th>種別</th>
                <th>状態</th>
                <th>エリア</th>
                <th>担当</th>
                <th>有効</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className={!row.enabled ? styles.rowDisabled : ''}>
                  <td className={styles.titleCell}>{row.title}</td>
                  <td>{row.activity_type ?? '—'}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>{row.area ?? '—'}</td>
                  <td>{row.operator ?? '—'}</td>
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
        <TeamModal
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

// ── Team Edit Modal ────────────────────────────────────────────
type MuniOption = { label: string; display: string; parent: string; code: string; lat: number; lon: number }

const nospace = (s: string) => s.replace(/\s+/g, '')

function TeamModal({ row, isNew, onChange, onSave, onClose, error }: {
  row: TeamRow
  isNew: boolean
  onChange: (r: TeamRow) => void
  onSave: (r: TeamRow) => void
  onClose: () => void
  error: string | null
}) {
  const set = (key: keyof TeamRow, val: unknown) => onChange({ ...row, [key]: val })
  const [areaInput, setAreaInput] = useState(row.area ?? '')
  const [areaSuggestOpen, setAreaSuggestOpen] = useState(false)
  const [muniOptions, setMuniOptions] = useState<MuniOption[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/map/regions/index.json')
        const data = await res.json()
        const regions: Array<{ id: string }> = data.regions ?? []
        const all: MuniOption[] = []

        for (const region of regions) {
          try {
            const r2 = await fetch(`/map/regions/${region.id}/municipalities.json`)
            const md = await r2.json()
            const munis: Array<{ id: string; label: string; viewport?: { lat: number; lon: number }; hasDistrictPolygons?: boolean }> = md.municipalities ?? []

            // Municipality-level entries
            for (const m of munis) {
              if (m.viewport) {
                all.push({ label: m.label, display: m.label, parent: '', code: m.id, lat: m.viewport.lat, lon: m.viewport.lon })
              }
            }

            // District-level entries — load pre-built index if available
            if (munis.some(m => m.hasDistrictPolygons)) {
              try {
                const r3 = await fetch(`/data/${region.id}/districts-index.json`)
                if (r3.ok) {
                  const raw: Array<{ label: string; code: string; lat: number; lon: number }> = await r3.json()
                  for (const d of raw) {
                    // "岡山市 北区 京山一丁目" → display="京山一丁目", parent="岡山市 北区"
                    const parts = d.label.split(' ')
                    const display = parts[parts.length - 1]
                    const parent = parts.slice(0, -1).join(' ')
                    all.push({ label: d.label, display, parent, code: d.code, lat: d.lat, lon: d.lon })
                  }
                }
              } catch { /* no index for this region yet */ }
            }
          } catch { /* region not loaded */ }
        }

        if (!cancelled) setMuniOptions(all)
      } catch { /* index not found */ }
    })()
    return () => { cancelled = true }
  }, [])

  const areaSuggestions = useMemo(() => {
    const q = nospace(areaInput.trim())
    if (q.length < 1) return []
    return muniOptions.filter(m => nospace(m.label).includes(q)).slice(0, 12)
  }, [muniOptions, areaInput])

  function selectArea(m: MuniOption) {
    const areaLabel = m.parent ? `${m.parent} ${m.display}` : m.display
    setAreaInput(areaLabel)
    setAreaSuggestOpen(false)
    onChange({ ...row, area: areaLabel, municipality_code: m.code, lat: m.lat, lon: m.lon })
  }

  const hasCoords = row.lat !== 0 || row.lon !== 0

  return (
    <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <h2 className={styles.modalTitle}>{isNew ? 'チーム活動を追加' : 'チーム活動を編集'}</h2>
        <div className={styles.modalGrid}>
          <TextField label="チーム名" value={row.title} maxLength={FIELD_LIMITS.title} onChange={v => set('title', v)} />
          <TextField label="活動種別" value={row.activity_type ?? ''} maxLength={FIELD_LIMITS.activityType} onChange={v => set('activity_type', v || null)} />
          <label className={styles.field}>
            <span>状態</span>
            <select value={row.status} onChange={e => set('status', e.target.value)}>
              {['active', 'standby', 'completed', 'inactive'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <TextField label="担当" value={row.operator ?? ''} maxLength={FIELD_LIMITS.operator} onChange={v => set('operator', v || null)} />

          {/* Area with autocomplete */}
          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>エリア（地区名）</span>
            <div className={styles.areaWrap}>
              <input
                type="text"
                value={areaInput}
                placeholder="市区町村名を入力..."
                maxLength={FIELD_LIMITS.area}
                onChange={e => {
                  setAreaInput(e.target.value)
                  set('area', e.target.value || null)
                  setAreaSuggestOpen(true)
                }}
                onFocus={() => setAreaSuggestOpen(true)}
                onBlur={() => setTimeout(() => setAreaSuggestOpen(false), 150)}
              />
              {areaSuggestOpen && areaInput.trim() && (
                <ul className={styles.areaSuggestList} role="listbox">
                  {areaSuggestions.length > 0 ? areaSuggestions.map((m, i) => (
                    <li
                      key={`${m.code}-${i}`}
                      className={styles.areaSuggestItem}
                      role="option"
                      onMouseDown={e => { e.preventDefault(); selectArea(m) }}
                    >
                      <span className={styles.areaSuggestDisplay}>{m.display}</span>
                      {m.parent && <span className={styles.areaSuggestParent}>{m.parent}</span>}
                    </li>
                  )) : (
                    <li className={styles.areaSuggestNone}>一致する地区がありません</li>
                  )}
                </ul>
              )}
            </div>
            {hasCoords && (
              <span className={styles.areaCoords}>
                緯度 {row.lat.toFixed(4)} / 経度 {row.lon.toFixed(4)}
                {row.municipality_code ? `（${row.municipality_code}）` : ''}
              </span>
            )}
          </label>

          <label className={`${styles.field} ${styles.fieldFull}`}>
            <span>メモ</span>
            <textarea rows={3} maxLength={FIELD_LIMITS.note} value={row.note ?? ''} onChange={e => set('note', e.target.value || null)} />
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
