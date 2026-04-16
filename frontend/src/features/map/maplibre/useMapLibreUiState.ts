import { useState } from 'react'
import type { MapLibrePopupInfo } from '@/features/map/maplibre/featurePopupBuilders'

export function useMapLibreUiState() {
  const [popupInfo, setPopupInfo] = useState<MapLibrePopupInfo | null>(null)

  return {
    popupInfo,
    setPopupInfo,
    closePopup: () => setPopupInfo(null),
  }
}
