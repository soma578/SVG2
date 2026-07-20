import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '../dashboard/LogoutButton'
import styles from './webcam-cache.module.css'

type WebcamCacheImage = {
  id?: string
  cameraId?: string
  imageUrl?: string
  sourceImageUrl?: string
  status?: 'fresh' | 'fetched' | 'failed' | string
  error?: string
}

type WebcamCacheManifest = {
  updatedAt?: string
  source?: string
  policy?: {
    clientExternalFetch?: boolean
    delayMs?: number
    ttlMinutes?: number
  }
  summary?: {
    total?: number
    fetched?: number
    skipped?: number
    failed?: number
    failureRate?: number
    nextRecommendedAt?: string
  }
  images?: WebcamCacheImage[]
}

const manifestPath = resolve(process.cwd(), '..', 'map', 'media-cache', 'webcams', 'manifest.json')

async function loadManifest() {
  if (!existsSync(manifestPath)) return null
  const text = await readFile(manifestPath, 'utf8')
  return JSON.parse(text) as WebcamCacheManifest
}

const formatDate = (value?: string) => {
  if (!value) return '未取得'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Tokyo',
  }).format(date)
}

const statusLabel = (status?: string) => {
  if (status === 'fetched') return '取得'
  if (status === 'fresh') return '新鮮'
  if (status === 'failed') return '失敗'
  return status || '不明'
}

export default async function AdminWebcamCachePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const manifest = await loadManifest()
  const summary = manifest?.summary || {}
  const images = manifest?.images || []
  const failedImages = images.filter((image) => image.status === 'failed')
  const recentImages = images.slice(-12).reverse()
  const failureRate = Number(summary.failureRate || 0)

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>Webカメラキャッシュ</span>
        <a className={styles.navLink} href="/admin/dashboard">データ管理</a>
        <a className={styles.navLink} href="/admin/layers">レイヤー生成</a>
        <a className={styles.navLink} href="/map/webapp/native-map.html?regionId=okayama&municipalityId=okayama-kita">地図</a>
        <span className={styles.userEmail}>{user.email}</span>
        <LogoutButton />
      </header>

      <main className={styles.main}>
        {!manifest ? (
          <section className={styles.empty}>
            <h1>キャッシュmanifestがありません</h1>
            <p>
              `npm run webcams:cache` を実行すると、
              `map/media-cache/webcams/manifest.json` が生成されます。
            </p>
          </section>
        ) : (
          <>
            <section className={styles.hero}>
              <div>
                <p className={styles.eyebrow}>Cache Policy</p>
                <h1>閲覧者ブラウザから外部カメラ画像を直接取得しない</h1>
                <p>
                  管理側の単一ジョブで画像を取得し、公開側にはキャッシュ画像だけを配信します。
                </p>
              </div>
              <div className={styles.policy}>
                <span>最終更新</span>
                <strong>{formatDate(manifest.updatedAt)}</strong>
                <span>次回推奨</span>
                <strong>{formatDate(summary.nextRecommendedAt)}</strong>
              </div>
            </section>

            <section className={styles.stats}>
              <div>
                <span>対象</span>
                <strong>{Number(summary.total || 0).toLocaleString()}</strong>
              </div>
              <div>
                <span>取得</span>
                <strong>{Number(summary.fetched || 0).toLocaleString()}</strong>
              </div>
              <div>
                <span>スキップ</span>
                <strong>{Number(summary.skipped || 0).toLocaleString()}</strong>
              </div>
              <div className={failureRate > 0.2 ? styles.danger : ''}>
                <span>失敗</span>
                <strong>{Number(summary.failed || 0).toLocaleString()}</strong>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2>運用状態</h2>
                <code>npm run webcams:cache</code>
              </div>
              <dl className={styles.meta}>
                <div>
                  <dt>外部直接取得</dt>
                  <dd>{manifest.policy?.clientExternalFetch === false ? '禁止' : '要確認'}</dd>
                </div>
                <div>
                  <dt>取得間隔</dt>
                  <dd>{Number(manifest.policy?.delayMs || 0).toLocaleString()} ms</dd>
                </div>
                <div>
                  <dt>TTL</dt>
                  <dd>{Number(manifest.policy?.ttlMinutes || 0).toLocaleString()} 分</dd>
                </div>
                <div>
                  <dt>失敗率</dt>
                  <dd>{(failureRate * 100).toFixed(1)}%</dd>
                </div>
              </dl>
            </section>

            <section className={styles.grid}>
              <div className={styles.panel}>
                <h2>直近の処理</h2>
                <ul className={styles.list}>
                  {recentImages.map((image) => (
                    <li key={`${image.id}-${image.cameraId}-${image.status}`}>
                      <span className={`${styles.badge} ${styles[`badge_${image.status}`] || ''}`}>
                        {statusLabel(image.status)}
                      </span>
                      <strong>{image.id || image.cameraId || 'camera'}</strong>
                      <small>{image.imageUrl || '画像なし'}</small>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={styles.panel}>
                <h2>失敗</h2>
                {failedImages.length === 0 ? (
                  <p className={styles.muted}>失敗はありません。</p>
                ) : (
                  <ul className={styles.list}>
                    {failedImages.slice(0, 12).map((image) => (
                      <li key={`${image.id}-${image.cameraId}-failed`}>
                        <span className={`${styles.badge} ${styles.badge_failed}`}>失敗</span>
                        <strong>{image.id || image.cameraId || 'camera'}</strong>
                        <small>{image.error || '取得できませんでした'}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
