import { useState, type CSSProperties, type FormEvent } from 'react'
import styles from './page.module.css'
import type { LayerState } from './mapTypes'

const EVACUATION_LEGEND = [
  { key: 'open', label: '開設中', icon: '/map/icons/shelter-open.svg' },
  { key: 'limited', label: '要確認', icon: '/map/icons/shelter-limited.svg' },
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

const HAZARD_LEGEND: { key: string; label: string; style: CSSProperties }[] = [
  {
    key: 'flood',
    label: '洪水浸水想定区域',
    style: { background: 'rgba(59, 130, 246, 0.28)', border: '2px solid rgba(29, 78, 216, 0.7)' },
  },
  {
    key: 'tsunami',
    label: '津波浸水想定区域',
    style: { background: 'rgba(168, 85, 247, 0.28)', border: '2px solid rgba(126, 34, 206, 0.7)' },
  },
  {
    key: 'landslide-warning',
    label: '土砂災害警戒区域',
    style: { background: 'rgba(249, 115, 22, 0.22)', border: '2px solid rgba(194, 65, 12, 0.8)' },
  },
  {
    key: 'landslide-special',
    label: '土砂災害特別警戒区域',
    style: { background: 'rgba(239, 68, 68, 0.35)', border: '2px solid rgba(153, 27, 27, 0.9)' },
  },
]

const layerGroupLabel = (layer: LayerState) => layer.group || '防災情報'

const layerMarker = (layerId: string) => {
  if (layerId === 'evacuation') {
    return <img src="/map/icons/shelter-open.svg" alt="" />
  }
  if (layerId === 'teamActivity') {
    return <img src="/map/icons/team-active.svg" alt="" />
  }
  return <span className={`${styles.layerMarkerShape} ${styles[`layerMarker_${layerId}`] || ''}`} />
}

type SidebarProps = {
  variant?: 'desktop' | 'sheet'
  shareOpen: boolean
  shareLink: string
  shareStatus: string
  layers: LayerState[]
  runtimeReady: boolean
  isOnline: boolean | null
  regionLabel: string
  onCloseShare: () => void
  onCopyShareLink: () => void
  onToggleLayer: (layerId: string) => void
  onImportLayers: (input: { kind: 'container' | 'layer'; url: string; title?: string }) => Promise<number>
  onRemoveLayer: (layerId: string) => void
}

export default function Sidebar({
  variant = 'desktop',
  shareOpen,
  shareLink,
  shareStatus,
  layers,
  runtimeReady,
  isOnline,
  regionLabel,
  onCloseShare,
  onCopyShareLink,
  onToggleLayer,
  onImportLayers,
  onRemoveLayer,
}: SidebarProps) {
  const [importOpen, setImportOpen] = useState(false)
  const [importKind, setImportKind] = useState<'container' | 'layer'>('container')
  const [importUrl, setImportUrl] = useState('')
  const [importTitle, setImportTitle] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [importError, setImportError] = useState(false)
  const [importing, setImporting] = useState(false)
  const visibleCount = layers.filter((layer) => layer.visible && !layer.disabled).length
  const isVisible = (id: string) => layers.some((layer) => layer.id === id && layer.visible)

  const submitImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setImporting(true)
    setImportError(false)
    setImportStatus('確認中...')
    try {
      const count = await onImportLayers({ kind: importKind, url: importUrl, title: importTitle })
      setImportStatus(`${count}件を追加しました`)
      setImportUrl('')
      setImportTitle('')
    } catch (error) {
      setImportError(true)
      setImportStatus(error instanceof TypeError
        ? '取得できません。URLまたはCORS設定を確認してください'
        : error instanceof Error ? error.message : '追加できませんでした')
    } finally {
      setImporting(false)
    }
  }

  return (
    <aside className={`${styles.sidebar} ${variant === 'sheet' ? styles.sidebarSheet : ''}`}>
      {shareOpen ? (
        <section className={styles.sharePanelCompact}>
          <div className={styles.sharePanelHeader}>
            <strong>共有リンク</strong>
            <button type="button" className={styles.sharePanelClose} onClick={onCloseShare} aria-label="閉じる">
              ×
            </button>
          </div>
          <input
            className={styles.sharePanelInput}
            value={shareLink}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className={styles.sharePanelActions}>
            <button type="button" className={styles.sharePanelCopy} onClick={onCopyShareLink}>
              コピー
            </button>
            <span className={styles.sharePanelStatus}>{shareStatus || 'URLを共有できます'}</span>
          </div>
        </section>
      ) : null}

      <div className={styles.layerPanelHeader}>
        <div>
          <p>MAP LAYERS</p>
          <h2>表示レイヤー</h2>
        </div>
        <div className={styles.layerPanelActions}>
          <button
            type="button"
            className={`${styles.layerImportButton} ${importOpen ? styles.layerImportButtonActive : ''}`}
            onClick={() => setImportOpen((open) => !open)}
            aria-label="外部レイヤーを追加"
            title="外部レイヤーを追加"
          >
            ＋
          </button>
          <span>{visibleCount} / {layers.filter((layer) => !layer.disabled).length}</span>
        </div>
      </div>

      {importOpen ? (
        <form className={styles.layerImportForm} onSubmit={submitImport}>
          <select
            value={importKind}
            onChange={(event) => setImportKind(event.target.value as 'container' | 'layer')}
            aria-label="インポート形式"
          >
            <option value="container">Container.svg</option>
            <option value="layer">SVG / HTML</option>
          </select>
          <input
            type="url"
            value={importUrl}
            onChange={(event) => setImportUrl(event.target.value)}
            placeholder={importKind === 'container' ? 'https://example.jp/Container.svg' : 'https://example.jp/layer.svg'}
            aria-label="レイヤーURL"
            required
          />
          {importKind === 'layer' ? (
            <input
              type="text"
              value={importTitle}
              onChange={(event) => setImportTitle(event.target.value)}
              placeholder="レイヤー名"
              aria-label="レイヤー名"
            />
          ) : null}
          <div className={styles.layerImportSubmitRow}>
            <span className={importError ? styles.layerImportError : ''}>{importStatus}</span>
            <button type="submit" disabled={importing}>追加</button>
          </div>
        </form>
      ) : null}

      <div className={styles.layerToggleList}>
        {layers.map((layer, index) => {
          const group = layerGroupLabel(layer)
          const previousGroup = index > 0 ? layerGroupLabel(layers[index - 1]) : ''
          return (
            <div key={layer.id}>
              {group !== previousGroup ? <p className={styles.layerGroupTitle}>{group}</p> : null}
              <div className={styles.layerToggleRow}>
                <label className={styles.layerToggleItem} aria-disabled={layer.disabled || undefined}>
                  <span className={styles.layerMarker} aria-hidden="true">{layerMarker(layer.id)}</span>
                  <span className={styles.layerLabel}>
                    <strong>{layer.label}</strong>
                    {layer.note ? <small>{layer.note}</small> : null}
                  </span>
                  <input
                    type="checkbox"
                    className={styles.toggleInput}
                    checked={layer.visible}
                    disabled={layer.disabled}
                    onChange={() => onToggleLayer(layer.id)}
                    aria-label={`${layer.label}を表示`}
                  />
                  <span className={styles.toggleTrack} aria-hidden="true">
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
                {layer.imported ? (
                  <button
                    type="button"
                    className={styles.layerRemoveButton}
                    onClick={() => onRemoveLayer(layer.id)}
                    aria-label={`${layer.label}を削除`}
                    title={`${layer.label}を削除`}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {(isVisible('evacuation') || isVisible('teamActivity') || isVisible('hazard')) ? (
        <section className={styles.compactLegend}>
          <h2>凡例</h2>
          {isVisible('evacuation') ? (
            <div className={styles.legendSection}>
              <p className={styles.legendTitle}>避難所</p>
              <ul className={styles.legendList}>
                {EVACUATION_LEGEND.map((item) => (
                  <li key={item.key} className={styles.legendItem}>
                    <span className={styles.legendIcon} aria-hidden="true"><img src={item.icon} alt="" /></span>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isVisible('teamActivity') ? (
            <div className={styles.legendSection}>
              <p className={styles.legendTitle}>チーム活動</p>
              <ul className={styles.legendList}>
                {TEAM_LEGEND.map((item) => (
                  <li key={item.key} className={styles.legendItem}>
                    <span className={styles.legendIcon} aria-hidden="true"><img src={item.icon} alt="" /></span>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isVisible('hazard') ? (
            <div className={styles.legendSection}>
              <p className={styles.legendTitle}>ハザード</p>
              <ul className={styles.legendList}>
                {HAZARD_LEGEND.map((item) => (
                  <li key={item.key} className={styles.legendItem}>
                    <span className={styles.legendSwatch} style={item.style} aria-hidden="true" />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className={styles.layerPanelFooter}>
        <span className={`${styles.runtimeDot} ${runtimeReady ? styles.runtimeDotReady : ''}`} aria-hidden="true" />
        <strong>{regionLabel || '地域未選択'}</strong>
        <span>{isOnline === false ? 'オフライン' : runtimeReady ? '表示準備完了' : '読込中'}</span>
      </footer>
    </aside>
  )
}
