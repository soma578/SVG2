// 避難所データの型定義
export interface Shelter {
  id: string
  name: string
  kind: string
  lat: number
  lon: number
  url: string
  summary: string
  type?: 'general' | 'welfare' | 'wide'
  address?: string
  capacity?: number
  barrier_free?: boolean
  pets?: boolean
  updated_at?: string
}

// レイヤー定義の型
export interface LayerDefinition {
  id: string
  label: string
  group: 'ベースマップ' | '情報レイヤー'
  defaultVisible?: boolean
}

// 気象データの型
export interface WeatherData {
  station: {
    name: string
    lon: number
    lat: number
  }
  display: {
    label: string
    icon: string
    temperature: string
  }
}

// ももちゃりポートの型定義
export interface MomochariPort {
  id: string
  lat: number
  lon: number
  status?: string
  floodRank?: number  // 災害ランク（0=安全, 1=注意, 2=警戒, 3=危険）
  landslideRank?: number
}

// 管理画面用のデータセット情報
export interface Dataset {
  name: string
  filename: string
  lastUpdated: string
  recordCount: number
}
