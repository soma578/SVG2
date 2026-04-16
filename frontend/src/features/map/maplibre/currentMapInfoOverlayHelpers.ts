import type { MapLibrePopupInfo } from '@/features/map/maplibre/featurePopupBuilders'

export type CurrentMapDebugStats = {
  layerCounts: Record<string, number>
  totalFeatures: number
}

export function getPopupTypeLabel(type?: string) {
  switch (type) {
    case 'baseArea':
      return 'L1 ベースエリア'
    case 'shelter':
      return 'L2 避難所'
    case 'team':
      return 'L3 チーム活動'
    default:
      return type || null
  }
}

export function getPopupPanelOffset(showSidebar: boolean) {
  return {
    position: 'absolute' as const,
    top: '1rem',
    left: showSidebar ? '16px' : '80px',
  }
}

export function hasPopupDescription(popupInfo: MapLibrePopupInfo | null) {
  return Boolean(popupInfo?.description?.trim())
}
