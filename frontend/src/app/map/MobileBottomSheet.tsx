'use client'

import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import styles from './MobileBottomSheet.module.css'

const SNAP_POINTS = ['60px', 0.5, 0.9] as const

export type SnapPoint = (typeof SNAP_POINTS)[number] | null

export const SNAP_PEEK: SnapPoint = SNAP_POINTS[0]
export const SNAP_HALF: SnapPoint = SNAP_POINTS[1]
export const SNAP_FULL: SnapPoint = SNAP_POINTS[2]

type MobileBottomSheetProps = {
  peekContent: ReactNode
  children: ReactNode
  activeSnapPoint?: SnapPoint
  onSnapChange?: (snap: SnapPoint) => void
}

export default function MobileBottomSheet({
  peekContent,
  children,
  activeSnapPoint: controlledSnap,
  onSnapChange,
}: MobileBottomSheetProps) {
  const [internalSnap, setInternalSnap] = useState<SnapPoint>(SNAP_PEEK)
  const snap = controlledSnap !== undefined ? controlledSnap : internalSnap

  const handleSnapChange = (next: number | string | null) => {
    const nextSnap = next as SnapPoint
    if (controlledSnap === undefined) setInternalSnap(nextSnap)
    onSnapChange?.(nextSnap)
  }

  const openFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && snap === SNAP_PEEK) {
      event.preventDefault()
      handleSnapChange(SNAP_HALF)
    }
  }

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && snap !== SNAP_PEEK) handleSnapChange(SNAP_PEEK)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [snap])

  return (
    <Drawer.Root
      open
      dismissible={false}
      modal={false}
      snapPoints={[...SNAP_POINTS]}
      activeSnapPoint={snap}
      setActiveSnapPoint={handleSnapChange}
      shouldScaleBackground={false}
    >
      <Drawer.Portal>
        <Drawer.Content className={styles.content}>
          {/* スクリーンリーダー向け: Radix Dialog が要求する Title/Description。
              視覚的には隠す（VisuallyHidden 相当の .srOnly）。 */}
          <Drawer.Title className={styles.srOnly}>詳細パネル</Drawer.Title>
          <Drawer.Description className={styles.srOnly}>
            地図で選択した避難所や活動の詳細情報を表示します。
          </Drawer.Description>
          <div className={styles.handleWrap}>
            <Drawer.Handle className={styles.handle} />
          </div>

          <div
            className={styles.peek}
            onClick={() => {
              if (snap === SNAP_PEEK) handleSnapChange(SNAP_HALF)
            }}
            onKeyDown={openFromKeyboard}
            role="button"
            tabIndex={0}
            aria-label="詳細パネルを開く"
          >
            {peekContent}
          </div>

          <div className={styles.body} data-vaul-no-drag>
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
