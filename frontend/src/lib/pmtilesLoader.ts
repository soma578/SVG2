/**
 * PMTiles読み込みユーティリティ
 */

import { Protocol } from 'pmtiles';
import maplibregl from 'maplibre-gl';

let protocolRegistered = false;

/**
 * PMTilesプロトコルをMapLibreに登録
 */
export function registerPMTilesProtocol() {
  if (protocolRegistered || typeof window === 'undefined') {
    return;
  }

  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;

  console.log('✅ PMTilesプロトコル登録完了');
}

/**
 * PMTilesソースの設定を生成
 */
export function createPMTilesSource(tileUrl: string) {
  return {
    type: 'vector' as const,
    url: `pmtiles://${tileUrl}`,
  };
}

/**
 * PMTilesレイヤー定義
 */
export interface PMTilesLayerConfig {
  id: string;
  sourceLayer: string;
  type: 'fill' | 'line' | 'circle' | 'symbol';
  paint?: Record<string, any>;
  layout?: Record<string, any>;
  minzoom?: number;
  maxzoom?: number;
}

/**
 * 全国展開用のPMTilesレイヤー定義
 */
export const nationalLayers = {
  // 地区境界
  districts: {
    source: '/tiles/japan_districts.pmtiles',
    layers: [
      {
        id: 'districts-fill',
        sourceLayer: 'districts',
        type: 'fill' as const,
        paint: {
          'fill-color': 'rgba(200, 200, 200, 0.1)',
          'fill-outline-color': 'rgba(100, 100, 100, 0.5)',
        },
        minzoom: 11,
      },
      {
        id: 'districts-line',
        sourceLayer: 'districts',
        type: 'line' as const,
        paint: {
          'line-color': 'rgba(100, 100, 100, 0.7)',
          'line-width': 1,
        },
        minzoom: 11,
      },
    ],
  },

  // 土砂災害警戒区域
  landslide: {
    source: '/tiles/landslide_hazard.pmtiles',
    layers: [
      {
        id: 'landslide-warning',
        sourceLayer: 'landslide',
        type: 'fill' as const,
        filter: ['==', 'level', 'warning'],
        paint: {
          'fill-color': 'rgba(255, 165, 0, 0.6)',
          'fill-outline-color': 'rgba(255, 140, 0, 0.8)',
        },
        minzoom: 10,
      },
      {
        id: 'landslide-special',
        sourceLayer: 'landslide',
        type: 'fill' as const,
        filter: ['==', 'level', 'special_warning'],
        paint: {
          'fill-color': 'rgba(220, 38, 38, 0.7)',
          'fill-outline-color': 'rgba(185, 28, 28, 0.9)',
        },
        minzoom: 10,
      },
    ],
  },

  // 浸水想定区域（将来実装）
  flood: {
    source: '/tiles/flood_hazard.pmtiles',
    layers: [
      {
        id: 'flood-0.5m',
        sourceLayer: 'flood',
        type: 'fill' as const,
        filter: ['==', 'depth_class', 'lt0_5'],
        paint: {
          'fill-color': 'rgba(173, 216, 230, 0.6)',
        },
        minzoom: 10,
      },
      {
        id: 'flood-3m',
        sourceLayer: 'flood',
        type: 'fill' as const,
        filter: ['==', 'depth_class', '0_5to3'],
        paint: {
          'fill-color': 'rgba(100, 149, 237, 0.7)',
        },
        minzoom: 10,
      },
      {
        id: 'flood-5m',
        sourceLayer: 'flood',
        type: 'fill' as const,
        filter: ['==', 'depth_class', '3to5'],
        paint: {
          'fill-color': 'rgba(65, 105, 225, 0.8)',
        },
        minzoom: 10,
      },
      {
        id: 'flood-over5m',
        sourceLayer: 'flood',
        type: 'fill' as const,
        filter: ['==', 'depth_class', 'gt5'],
        paint: {
          'fill-color': 'rgba(25, 25, 112, 0.9)',
        },
        minzoom: 10,
      },
    ],
  },

  // 福祉施設（全国130,362施設）
  welfare: {
    source: '/tiles/welfare_facilities.pmtiles',
    layers: [
      {
        id: 'welfare-points',
        sourceLayer: 'welfare',
        type: 'circle' as const,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, 3,
            15, 6,
            18, 10
          ],
          'circle-color': [
            'match',
            ['get', 'P14_004'],
            19, '#dc2626', // 特別養護老人ホーム
            18, '#ea580c', // 介護老人保健施設
            21, '#ca8a04', // 軽費老人ホーム
            20, '#16a34a', // 有料老人ホーム
            25, '#0891b2', // 認知症高齢者グループホーム
            24, '#2563eb', // 小規模多機能型居宅介護
            22, '#7c3aed', // デイサービスセンター
            '#6b7280'     // その他
          ],
          'circle-opacity': 0.8,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
        minzoom: 14,
      },
    ],
  },
};

/**
 * レイヤーIDから対応するPMTiles設定を取得
 */
export function getPMTilesConfig(layerId: string) {
  return nationalLayers[layerId as keyof typeof nationalLayers];
}
