'use client'

import { useEffect, useMemo, useState, type RefObject } from 'react'
import AreaControls from './AreaControls'
import MobileBottomSheet, { SNAP_HALF, SNAP_PEEK, type SnapPoint } from './MobileBottomSheet'
import Sidebar from './Sidebar'
import styles from './page.module.css'
import type { DataStatusEntry, FeatureDetailModel, GeoViewport, LayerState } from './mapTypes'
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
  featureDetail: FeatureDetailModel | null
  layers: LayerState[]
  runtimeReady: boolean
  isOnline: boolean | null
  dataStatuses: Record<string, DataStatusEntry>
  regionLabel: string
  onZoom: (direction: 'in' | 'out') => void
  onReset: () => void
  onCloseShare: () => void
  onCopyShareLink: () => void
  onCloseFeatureDetail: () => void
  onToggleLayer: (layerId: string) => void
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
  featureDetail,
  layers,
  runtimeReady,
  isOnline,
  dataStatuses,
  regionLabel,
  onZoom,
  onReset,
  onCloseShare,
  onCopyShareLink,
  onCloseFeatureDetail,
  onToggleLayer,
}: MapShellProps) {
  const hydrated = useHydrated()
  const isMobile = useIsMobile()
  const [sheetSnap, setSheetSnap] = useState<SnapPoint>(SNAP_PEEK)
  const statusEntries = useMemo(() => Object.values(dataStatuses), [dataStatuses])
  const latestStatus = useMemo(() =>
    statusEntries.reduce<DataStatusEntry | null>((latest, entry) => {
      if (!entry.updatedAt) return latest
      if (!latest?.updatedAt) return entry
      return Date.parse(entry.updatedAt) > Date.parse(latest.updatedAt) ? entry : latest
    }, null),
  [statusEntries])

  useEffect(() => {
    if (featureDetail && isMobile) setSheetSnap(SNAP_HALF)
  }, [featureDetail, isMobile])

  useEffect(() => {
    if (!isMobile) setSheetSnap(SNAP_PEEK)
  }, [isMobile])

  const closeFeatureDetail = () => {
    onCloseFeatureDetail()
    if (isMobile) setSheetSnap(SNAP_PEEK)
  }

  const sidebar = (variant: 'desktop' | 'sheet') => (
    <Sidebar
      variant={variant}
      shareOpen={shareOpen}
      shareLink={shareLink}
      shareStatus={shareStatus}
      featureDetail={featureDetail}
      layers={layers}
      runtimeReady={runtimeReady}
      isOnline={isOnline}
      dataStatuses={dataStatuses}
      regionLabel={regionLabel}
      onCloseShare={onCloseShare}
      onCopyShareLink={onCopyShareLink}
      onCloseFeatureDetail={closeFeatureDetail}
      onToggleLayer={onToggleLayer}
    />
  )

  const peekTime = latestStatus?.updatedAt
    ? new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(latestStatus.updatedAt))
    : null

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
              <strong>{featureDetail?.title || regionLabel || '防災情報'}</strong>
              <span className={isOnline === false ? styles.sheetOffline : ''}>
                {isOnline === false ? 'オフライン' : peekTime ? `${peekTime} 更新` : '読込中'}
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
