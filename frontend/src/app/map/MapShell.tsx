'use client'

import { useEffect, useState, type RefObject } from 'react'
import AreaControls from './AreaControls'
import MobileBottomSheet, { SNAP_HALF, SNAP_PEEK, type SnapPoint } from './MobileBottomSheet'
import Sidebar from './Sidebar'
import styles from './page.module.css'
import type { GeoViewport, LayerState } from './mapTypes'
import { useHydrated, useIsMobile } from '@/lib/useMediaQuery'

type MapShellProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>
  iframeSrc: string
  municipalityId: string
  mapViewport: GeoViewport | null
  resolvedViewport: GeoViewport | null
  shareOpen: boolean
  shareLink: string
  shareStatus: string
  layers: LayerState[]
  runtimeReady: boolean
  isOnline: boolean | null
  regionLabel: string
  onZoom: (direction: 'in' | 'out') => void
  onReset: () => void
  onCloseShare: () => void
  onCopyShareLink: () => void
  onToggleLayer: (layerId: string) => void
  onImportLayers: (input: { kind: 'container' | 'layer'; url: string; title?: string }) => Promise<number>
  onRemoveLayer: (layerId: string) => void
}

export default function MapShell({
  iframeRef,
  iframeSrc,
  municipalityId,
  mapViewport,
  resolvedViewport,
  shareOpen,
  shareLink,
  shareStatus,
  layers,
  runtimeReady,
  isOnline,
  regionLabel,
  onZoom,
  onReset,
  onCloseShare,
  onCopyShareLink,
  onToggleLayer,
  onImportLayers,
  onRemoveLayer,
}: MapShellProps) {
  const hydrated = useHydrated()
  const isMobile = useIsMobile()
  const [sheetSnap, setSheetSnap] = useState<SnapPoint>(SNAP_PEEK)
  useEffect(() => {
    if (!isMobile) setSheetSnap(SNAP_PEEK)
  }, [isMobile])

  const sidebar = (variant: 'desktop' | 'sheet') => (
    <Sidebar
      variant={variant}
      shareOpen={shareOpen}
      shareLink={shareLink}
      shareStatus={shareStatus}
      layers={layers}
      runtimeReady={runtimeReady}
      isOnline={isOnline}
      regionLabel={regionLabel}
      onCloseShare={onCloseShare}
      onCopyShareLink={onCopyShareLink}
      onToggleLayer={onToggleLayer}
      onImportLayers={onImportLayers}
      onRemoveLayer={onRemoveLayer}
    />
  )

  return (
    <div className={styles.mapGrid}>
      <section className={styles.mapFrame}>
        <iframe
          key={municipalityId}
          ref={iframeRef}
          src={iframeSrc || undefined}
          title="SVGMap"
          className={styles.iframe}
        />
        <AreaControls
          canZoom={Boolean(mapViewport || resolvedViewport)}
          canReset={Boolean(resolvedViewport)}
          onZoom={onZoom}
          onReset={onReset}
        />
      </section>

      {hydrated && isMobile ? (
        <MobileBottomSheet
          activeSnapPoint={sheetSnap}
          onSnapChange={setSheetSnap}
          peekContent={(
            <div className={styles.sheetPeekContent}>
              <strong>表示レイヤー</strong>
              <span className={isOnline === false ? styles.sheetOffline : ''}>
                {isOnline === false
                  ? 'オフライン'
                  : `${layers.filter((layer) => layer.visible && !layer.disabled).length}件を表示`}
              </span>
            </div>
          )}
        >
          {sidebar('sheet')}
        </MobileBottomSheet>
      ) : hydrated ? sidebar('desktop') : null}
    </div>
  )
}
