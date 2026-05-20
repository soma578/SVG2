import type { RefObject } from 'react'
import AreaControls from './AreaControls'
import Sidebar from './Sidebar'
import styles from './page.module.css'
import type { DataStatusEntry, GeoViewport, LayerState } from './mapTypes'

type MapShellProps = {
  iframeRef: RefObject<HTMLIFrameElement | null>
  iframeSrc: string
  municipalityId: string
  mapViewport: GeoViewport | null
  resolvedViewport: GeoViewport | null
  shareOpen: boolean
  shareLink: string
  shareStatus: string
  layerDetailHtml: string | null
  layers: LayerState[]
  runtimeReady: boolean
  isOnline: boolean | null
  dataStatuses: Record<string, DataStatusEntry>
  regionLabel: string
  onZoom: (direction: 'in' | 'out') => void
  onReset: () => void
  onCloseShare: () => void
  onCopyShareLink: () => void
  onCloseLayerDetail: () => void
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
  layerDetailHtml,
  layers,
  runtimeReady,
  isOnline,
  dataStatuses,
  regionLabel,
  onZoom,
  onReset,
  onCloseShare,
  onCopyShareLink,
  onCloseLayerDetail,
  onToggleLayer,
}: MapShellProps) {
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

      <Sidebar
        shareOpen={shareOpen}
        shareLink={shareLink}
        shareStatus={shareStatus}
        layerDetailHtml={layerDetailHtml}
        layers={layers}
        runtimeReady={runtimeReady}
        isOnline={isOnline}
        dataStatuses={dataStatuses}
        regionLabel={regionLabel}
        onCloseShare={onCloseShare}
        onCopyShareLink={onCopyShareLink}
        onCloseLayerDetail={onCloseLayerDetail}
        onToggleLayer={onToggleLayer}
      />
    </div>
  )
}
