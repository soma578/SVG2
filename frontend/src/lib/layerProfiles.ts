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

// 軽量化のためのレイヤープロファイル。
// minZoom: これ未満では非表示にする。simplify: ズームが低いときに頂点間引きする粒度。
export const layerProfiles: Record<string, LayerProfile> = {
  basemap: {
    id: 'basemap',
    title: '国土地理院 淡色地図',
    suggestedRenderMode: 'raster',
    minZoom: 6,
  },
  coastline: {
    id: 'coastline',
    title: '日本海岸線（ガイド）',
    suggestedRenderMode: 'svg',
    minZoom: 5,
  },
  spots: {
    id: 'spots',
    title: '岡山観光スポット',
    suggestedRenderMode: 'svg',
    minZoom: 8,
  },
  momochari: {
    id: 'momochari',
    title: 'ももちゃりポート',
    suggestedRenderMode: 'svg',
    minZoom: 11,
    notes: '岡山市オープンデータのポート位置',
  },
  weather: {
    id: 'weather',
    title: '現在の気象',
    suggestedRenderMode: 'svg',
    minZoom: 8,
  },
  rain: {
    id: 'rain',
    title: '降水ナウキャスト',
    suggestedRenderMode: 'raster',
    minZoom: 6,
    notes: '気象庁ナウキャストの降水強度タイル',
  },
  slope: {
    id: 'slope',
    title: '坂（傾斜）',
    suggestedRenderMode: 'raster',
    minZoom: 8,
    notes: '国土地理院の標高タイルから生成した傾斜レイヤ',
  },
  slopeVector: {
    id: 'slopeVector',
    title: '坂（傾斜）ベクタ',
    suggestedRenderMode: 'svg',
    minZoom: 9,
    notes: '傾斜を段彩ポリゴン化したベクタ版（重め）',
  },
  landslide: {
    id: 'landslide',
    title: '土砂災害警戒区域',
    suggestedRenderMode: 'svg',
    minZoom: 11,
    simplify: {
      coarseStep: 4,
      zoomThreshold: 12,
    },
    notes: '低ズームでは頂点を間引き、11未満では描画を抑止',
  },
  realShelters: {
    id: 'realShelters',
    title: '避難施設',
    suggestedRenderMode: 'svg',
    minZoom: 10,
  },
  welfare: {
    id: 'welfare',
    title: '老人福祉施設（全国）',
    suggestedRenderMode: 'raster',
    minZoom: 8,
    notes: '全国38,891施設（老人福祉施設のみ）。PMTilesベクタータイルで配信',
  },
  rivers: {
    id: 'rivers',
    title: '河川',
    suggestedRenderMode: 'svg',
    minZoom: 10,
    simplify: {
      coarseStep: 3,
      zoomThreshold: 12,
    },
    notes: 'ズームが低いときは線の頂点を間引く',
  },
  bikes: {
    id: 'bikes',
    title: 'ももチャリ（バックエンド経由）',
    suggestedRenderMode: 'canvas',
    notes: 'APIキー・ポーリングはサーバ側で制御',
  },
  districts: {
    id: 'districts',
    title: '地区境界（町丁・字）',
    suggestedRenderMode: 'svg',
    minZoom: 13,
    simplify: {
      coarseStep: 5,
      zoomThreshold: 14,
    },
    notes: '岡山県5,349地区の境界。高ズームでのみ表示',
  },
  outages: {
    id: 'outages',
    title: '停電情報',
    suggestedRenderMode: 'svg',
    minZoom: 8,
    notes: 'ズーム10以下は市区町村レベル、ズーム11以上は地区レベルで表示',
  },
}

export const getLayerProfile = (layerId: string) => layerProfiles[layerId]
