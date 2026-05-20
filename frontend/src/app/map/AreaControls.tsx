import styles from './page.module.css'

type AreaControlsProps = {
  canZoom: boolean
  canReset: boolean
  onZoom: (direction: 'in' | 'out') => void
  onReset: () => void
}

export default function AreaControls({ canZoom, canReset, onZoom, onReset }: AreaControlsProps) {
  return (
    <div className={styles.mapControls} aria-label="地図操作">
      <button
        type="button"
        className={styles.mapControlButton}
        onClick={() => onZoom('in')}
        aria-label="拡大"
        disabled={!canZoom}
      >
        ＋
      </button>
      <button
        type="button"
        className={styles.mapControlButton}
        onClick={() => onZoom('out')}
        aria-label="縮小"
        disabled={!canZoom}
      >
        −
      </button>
      <button
        type="button"
        className={styles.mapControlButton}
        onClick={onReset}
        aria-label="初期表示に戻る"
        disabled={!canReset}
      >
        ⌂
      </button>
    </div>
  )
}
