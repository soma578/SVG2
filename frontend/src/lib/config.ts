// 商用化を見据えた外部依存の切り替えポイント。
// raster は従来の地理院タイル、vector は OpenMapTiles 系の単一 vector source を想定する。
export const tileBaseUrl =
  process.env.NEXT_PUBLIC_TILE_BASE_URL ||
  'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'

export const detailBasemapMode =
  process.env.NEXT_PUBLIC_DETAIL_BASEMAP_MODE === 'vector' ? 'vector' : 'raster'

export const detailVectorSourceUrl = process.env.NEXT_PUBLIC_DETAIL_VECTOR_SOURCE_URL || ''

export const detailVectorSourceType =
  process.env.NEXT_PUBLIC_DETAIL_VECTOR_SOURCE_TYPE === 'tiles' ? 'tiles' : 'pmtiles'

export const detailVectorLayerNames = {
  landcover: process.env.NEXT_PUBLIC_DETAIL_VECTOR_LAYER_LANDCOVER || 'landcover',
  water: process.env.NEXT_PUBLIC_DETAIL_VECTOR_LAYER_WATER || 'water',
  waterway: process.env.NEXT_PUBLIC_DETAIL_VECTOR_LAYER_WATERWAY || 'waterway',
  road: process.env.NEXT_PUBLIC_DETAIL_VECTOR_LAYER_ROAD || 'transportation',
  boundary: process.env.NEXT_PUBLIC_DETAIL_VECTOR_LAYER_BOUNDARY || 'boundary',
  building: process.env.NEXT_PUBLIC_DETAIL_VECTOR_LAYER_BUILDING || 'building',
  place: process.env.NEXT_PUBLIC_DETAIL_VECTOR_LAYER_PLACE || 'place',
} as const
