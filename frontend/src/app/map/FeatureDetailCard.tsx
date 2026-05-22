'use client'

import styles from './FeatureDetailCard.module.css'
import type {
  FeatureDetailAction,
  FeatureDetailModel,
  FeatureDetailTone,
} from './mapTypes'

/**
 * Feature 詳細の描画コンポーネント。
 *
 * このコンポーネントは **表示モデルを描くだけ** の dumb component。
 * 守るべき不変条件:
 *   1. layerId を一切受け取らない・参照しない
 *   2. status / category / kind / feature.* を解釈しない
 *   3. ステータス辞書・アイコンマッピング・ラベル変換を持たない
 *   4. tone は CSS の色解決にだけ使う (意味解釈ではなくテーマ用)
 *
 * 「何を表示するか」「どんな色味で見せるか」は LaWA 側
 * (buildXxxFeatureDetail) で決定済み。
 * このコンポーネントは「どう描くか」だけを担当する。
 */

type FeatureDetailCardProps = {
  detail: FeatureDetailModel
  onClose: () => void
}

const toneClassName = (tone: FeatureDetailTone | undefined): string => {
  switch (tone) {
    case 'blue':  return styles.toneBlue
    case 'green': return styles.toneGreen
    case 'amber': return styles.toneAmber
    case 'red':   return styles.toneRed
    case 'gray':  return styles.toneGray
    default:      return ''
  }
}

/**
 * action.href の安全性チェック。
 *
 * LaWA は信頼されたコードだが、データソース由来の URL を
 * そのまま actions に詰めてくる可能性があるため、防御的に
 * 危険なプロトコルを弾く。
 *
 * 許可: https:, http:, mailto:, tel:, 相対 URL, fragment
 * 拒否: javascript:, data:, vbscript:, file: など
 */
const DANGEROUS_PROTOCOL_PATTERN = /^\s*(javascript|data|vbscript|file):/i

const isSafeHref = (href: unknown): href is string => {
  if (typeof href !== 'string') return false
  const trimmed = href.trim()
  if (trimmed.length === 0) return false
  return !DANGEROUS_PROTOCOL_PATTERN.test(trimmed)
}

const safeActions = (actions: FeatureDetailAction[] | undefined): FeatureDetailAction[] => {
  if (!Array.isArray(actions)) return []
  return actions.filter((a) => isSafeHref(a.href) && typeof a.label === 'string' && a.label.length > 0)
}

export default function FeatureDetailCard({
  detail,
  onClose,
}: FeatureDetailCardProps) {
  const accentClass = toneClassName(detail.accent)
  const validActions = safeActions(detail.actions)

  return (
    <section
      className={[styles.card, accentClass].filter(Boolean).join(' ')}
      aria-label="詳細"
    >
      <header className={styles.header}>
        {detail.badge ? (
          <span
            className={[styles.badge, toneClassName(detail.badge.tone)]
              .filter(Boolean)
              .join(' ')}
          >
            {detail.badge.label}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className={styles.closeButton}
        >
          ×
        </button>
      </header>

      <div className={styles.hero}>
        {detail.icon ? (
          <div className={styles.heroIcon}>
            <img src={detail.icon.src} alt={detail.icon.alt ?? ''} />
          </div>
        ) : null}
        <div className={styles.heroMeta}>
          <h3 className={styles.title}>{detail.title}</h3>
          {detail.subtitle ? (
            <p className={styles.subtitle}>{detail.subtitle}</p>
          ) : null}
        </div>
      </div>

      {detail.rows && detail.rows.length > 0 ? (
        <dl className={styles.rows}>
          {detail.rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className={styles.row}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {detail.sections?.map((section, sectionIndex) => (
        <section
          key={`${section.title}-${sectionIndex}`}
          className={styles.section}
        >
          <h4 className={styles.sectionTitle}>{section.title}</h4>
          {section.rows.length > 0 ? (
            <dl className={styles.rows}>
              {section.rows.map((row, rowIndex) => (
                <div key={`${row.label}-${rowIndex}`} className={styles.row}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ))}

      {validActions.length > 0 ? (
        <div className={styles.actions}>
          {validActions.map((action, index) => (
            <a
              key={`${action.label}-${index}`}
              href={action.href}
              className={styles.actionLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {action.label}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  )
}
