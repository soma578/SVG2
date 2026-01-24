/**
 * 地図表示モードの定義
 * README2の提案に基づき、防災シミュレーションとしてモードを切り替える
 */

export type MapMode = 'normal' | 'rain-alert' | 'flood-emergency'

export interface ModeConfig {
  id: MapMode
  label: string
  description: string
  defaultLayers: Record<string, boolean>
  cssClass: string
  icon: string
}

export const mapModes: Record<MapMode, ModeConfig> = {
  'normal': {
    id: 'normal',
    label: '平常時',
    description: '通常の地図表示。観光スポットやももちゃりポートを確認できます',
    defaultLayers: {
      basemap: true,
      spots: true,
      bikes: true,
      weather: false,
      rain: false,
      slope: false,
      landslide: false,
      realShelters: false,
      rivers: false,
    },
    cssClass: 'mode-normal',
    icon: '☀️',
  },
  'rain-alert': {
    id: 'rain-alert',
    label: '大雨警戒',
    description: 'ハザード情報を薄く表示。危険なポートを半透明で警告します',
    defaultLayers: {
      basemap: true,
      spots: true,
      bikes: true,
      landslide: true,
      rivers: true,
      realShelters: true,
      weather: false,
      rain: true,
      slope: false,
    },
    cssClass: 'mode-rain-alert',
    icon: '🌧️',
  },
  'flood-emergency': {
    id: 'flood-emergency',
    label: '洪水発生',
    description: '危険ポートを非表示、安全ポートを強調表示します',
    defaultLayers: {
      basemap: true,
      spots: true,
      bikes: true,
      landslide: true,
      rivers: true,
      realShelters: true,
      weather: false,
      rain: true,
      slope: false,
    },
    cssClass: 'mode-flood-emergency',
    icon: '🚨',
  },
}

/**
 * モードIDから設定を取得
 */
export function getModeConfig(mode: MapMode): ModeConfig {
  return mapModes[mode]
}

/**
 * モード切替時の説明メッセージ
 */
export function getModeChangeMessage(fromMode: MapMode, toMode: MapMode): string {
  const messages: Record<MapMode, string> = {
    'normal': '平常時モードに切り替えました。安全な状態です。',
    'rain-alert': '大雨警戒モードに切り替えました。危険なエリアを確認してください。',
    'flood-emergency': '洪水発生モードに切り替えました。安全なポートのみ表示されています。',
  }
  return messages[toMode]
}
