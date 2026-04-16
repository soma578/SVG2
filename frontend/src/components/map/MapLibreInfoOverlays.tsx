import type { MapLibrePopupInfo } from '@/features/map/maplibre/featurePopupBuilders'
import {
  getPopupPanelOffset,
  getPopupTypeLabel,
  hasPopupDescription,
  type CurrentMapDebugStats,
} from '@/features/map/maplibre/currentMapInfoOverlayHelpers'
import CreditBadge from './CreditBadge'
import Legend from './Legend'
import DebugPanel from './DebugPanel'

type Props = {
  activeLayers: Record<string, boolean>
  showSidebar: boolean
  popupInfo: MapLibrePopupInfo | null
  onClosePopup: () => void
  zoom: number
  debugStats: CurrentMapDebugStats
}

export default function MapLibreInfoOverlays({
  activeLayers,
  showSidebar,
  popupInfo,
  onClosePopup,
  zoom,
  debugStats,
}: Props) {
  const popupTypeLabel = getPopupTypeLabel(popupInfo?.type)

  return (
    <>
      {popupInfo && (
        <aside
          className="w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden transition-all duration-300 ease-in-out"
          style={getPopupPanelOffset(showSidebar)}
        >
          <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700">
            <div className="flex justify-between items-start">
              <h2 className="text-lg font-bold text-white pr-2">{popupInfo.name}</h2>
              <button
                onClick={onClosePopup}
                className="text-white/90 hover:text-white transition-colors flex-shrink-0"
                aria-label="閉じる"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {popupTypeLabel && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {popupTypeLabel}
                </span>
              </div>
            )}

            {hasPopupDescription(popupInfo) && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">詳細</h3>
                <p className="text-sm text-gray-900 whitespace-pre-line">{popupInfo.description}</p>
              </div>
            )}

            {popupInfo.url && (
              <a
                href={popupInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center font-medium py-2.5 px-4 rounded-lg transition-colors"
              >
                関連リンクを開く
              </a>
            )}
          </div>
        </aside>
      )}

      <Legend
        activeLayers={activeLayers}
        zoom={zoom}
        sidebarOpen={showSidebar}
      />

      <DebugPanel stats={debugStats} visible={false} />

      <div className="absolute right-4 bottom-4 z-20 flex flex-col gap-2 items-end pointer-events-none">
        <CreditBadge
          label="表示レイヤー: L1 / L2 / L3"
        />
      </div>
    </>
  )
}
