export type RenderMode = 'svg' | 'canvas' | 'raster'

export type LayerProfile = {
  id: string
  title: string
  suggestedRenderMode: RenderMode
  minZoom?: number
  maxZoom?: number
  simplify?: {
    coarseStep: number
    zoomThreshold: number
  }
  notes?: string
}

export const currentMapLayerProfiles: Record<string, LayerProfile> = {
  baseArea: {
    id: 'baseArea',
    title: 'L1 ベースエリア',
    suggestedRenderMode: 'svg',
    minZoom: 6,
    notes: '自治体境界と地区境界を重ねて表示する主要業務レイヤー',
  },
  basemap: {
    id: 'basemap',
    title: '国土地理院 淡色地図',
    suggestedRenderMode: 'raster',
    minZoom: 6,
  },
  evacuation: {
    id: 'evacuation',
    title: 'L2 避難所',
    suggestedRenderMode: 'svg',
    minZoom: 9,
  },
  teamActivity: {
    id: 'teamActivity',
    title: 'L3 チーム活動',
    suggestedRenderMode: 'svg',
    notes: '支援チームの現在地と活動状況',
  },
}

export const getLayerProfile = (layerId: string): LayerProfile | undefined =>
  currentMapLayerProfiles[layerId]
