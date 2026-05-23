import FeatureDetailCard from './FeatureDetailCard'
import styles from './page.module.css'
import type { DataStatusEntry, FeatureDetailModel, LayerState, RuntimeDataSource } from './mapTypes'

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

const sourceLabel = (source?: RuntimeDataSource) => {
  if (source === 'network') return 'オンライン更新'
  if (source === 'cache') return 'キャッシュ表示'
  if (source === 'fallback') return 'フォールバック'
  return '未読込'
}

const formatDataTime = (value?: string) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const formatDataAge = (value?: string) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'たった今'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  return `${days}日前`
}

type SidebarProps = {
  shareOpen: boolean
  shareLink: string
  shareStatus: string
  featureDetail: FeatureDetailModel | null
  layers: LayerState[]
  runtimeReady: boolean
  isOnline: boolean | null
  dataStatuses: Record<string, DataStatusEntry>
  regionLabel: string
  onCloseShare: () => void
  onCopyShareLink: () => void
  onCloseFeatureDetail: () => void
  onToggleLayer: (layerId: string) => void
}

export default function Sidebar({
  shareOpen,
  shareLink,
  shareStatus,
  featureDetail,
  layers,
  runtimeReady,
  isOnline,
  dataStatuses,
  regionLabel,
  onCloseShare,
  onCopyShareLink,
  onCloseFeatureDetail,
  onToggleLayer,
}: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      {shareOpen ? (
        <section className={styles.card}>
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
            <span className={styles.sharePanelStatus}>{shareStatus || 'URL をコピーして共有できます'}</span>
          </div>
        </section>
      ) : null}

      {featureDetail ? (
        <FeatureDetailCard detail={featureDetail} onClose={onCloseFeatureDetail} />
      ) : (
        <div className={styles.emptyFeature}>
          <div className={styles.emptyFeatureIcon} aria-hidden="true">
            <img src="/map/icons/team-standby.svg" alt="" />
          </div>
          <h3>選択中の情報はありません</h3>
          <p>地図上の避難所または活動アイコンをクリックすると、ここに詳細が表示されます。</p>
        </div>
      )}

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
                onClick={() => onToggleLayer(layer.id)}
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
          <dd>{regionLabel || '—'}</dd>
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
                {entry.updatedAt ? (
                  <time className={styles.dataStatusTime} dateTime={entry.updatedAt}>
                    {formatDataTime(entry.updatedAt)} 取得
                    {formatDataAge(entry.updatedAt) ? `（${formatDataAge(entry.updatedAt)}）` : ''}
                  </time>
                ) : null}
                {entry.message ? <small className={styles.dataStatusMessage}>{entry.message}</small> : null}
              </div>
            ))
          ) : (
            <p className={styles.featureMuted}>まだデータ状態は受信していません。</p>
          )}
        </div>
      </section>

      <a href="/admin/dashboard" className={styles.adminLink}>
        管理者画面へ
      </a>
    </aside>
  )
}
