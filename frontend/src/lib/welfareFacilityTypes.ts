/**
 * 老人福祉施設種別のマッピング（国土数値情報 P14-23）
 * P14_005: 02（老人福祉施設）
 * P14_006: 中分類コード
 */

export const FACILITY_TYPE_CODES = {
  '0201': '養護老人ホーム',
  '0202': 'ケアハウス',
  '0203': '老人福祉センター',
  '0204': 'デイサービスセンター',
  '0205': '短期入所生活介護',
  '0206': '在宅介護支援センター',
  '0207': '生活支援ハウス',
  '0299': 'その他老人福祉施設',
} as const

export const FACILITY_TYPE_COLORS = {
  '0201': '#dc2626',   // 養護老人ホーム: 赤
  '0202': '#ea580c',   // ケアハウス: オレンジ
  '0203': '#ca8a04',   // 老人福祉センター: 黄
  '0204': '#16a34a',   // デイサービスセンター: 緑
  '0205': '#0891b2',   // 短期入所生活介護: シアン
  '0206': '#2563eb',   // 在宅介護支援センター: 青
  '0207': '#7c3aed',   // 生活支援ハウス: 紫
  '0299': '#6b7280',   // その他: グレー
  default: '#9ca3af'   // 不明: ライトグレー
} as const

/**
 * 施設種別コード（P14_006）から名称を取得
 */
export function getFacilityTypeName(code: string): string {
  return FACILITY_TYPE_CODES[code as keyof typeof FACILITY_TYPE_CODES] || '不明'
}

/**
 * 施設種別コード（P14_006）から色を取得
 */
export function getFacilityTypeColor(code: string): string {
  return FACILITY_TYPE_COLORS[code as keyof typeof FACILITY_TYPE_COLORS] || FACILITY_TYPE_COLORS.default
}

/**
 * 主要な施設種別のリスト（凡例表示用）
 */
export const MAIN_FACILITY_TYPES = [
  { code: '0201', name: '養護老人ホーム', color: '#dc2626' },
  { code: '0202', name: 'ケアハウス', color: '#ea580c' },
  { code: '0203', name: '老人福祉センター', color: '#ca8a04' },
  { code: '0204', name: 'デイサービスセンター', color: '#16a34a' },
  { code: '0205', name: '短期入所生活介護', color: '#0891b2' },
  { code: '0206', name: '在宅介護支援センター', color: '#2563eb' },
  { code: '0207', name: '生活支援ハウス', color: '#7c3aed' },
  { code: '0299', name: 'その他老人福祉施設', color: '#6b7280' },
] as const
