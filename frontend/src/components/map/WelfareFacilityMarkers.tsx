/**
 * 福祉施設クラスターマーカーコンポーネント
 */

'use client';

import { useMemo } from 'react';
import { Marker } from 'react-map-gl/maplibre';
import { useWelfareClusters, getClusterColor, getClusterSize } from '@/hooks/useWelfareClusters';

interface WelfareFacility {
  id: string;
  name: string;
  type: string;
  coordinates: [number, number];
  prefName?: string;
  cityName?: string;
  address?: string;
  capacity?: number;
}

interface WelfareFacilityMarkersProps {
  facilities: WelfareFacility[];
  zoom: number;
  bounds?: [number, number, number, number]; // [west, south, east, north]
  onFacilityClick?: (facility: WelfareFacility) => void;
  onClusterClick?: (center: [number, number], zoom: number) => void;
}

export default function WelfareFacilityMarkers({
  facilities,
  zoom,
  bounds,
  onFacilityClick,
  onClusterClick,
}: WelfareFacilityMarkersProps) {
  // Superclusterでクラスタリング
  const { clusters, expandCluster } = useWelfareClusters(facilities, {
    zoom,
    bounds: bounds ? { west: bounds[0], south: bounds[1], east: bounds[2], north: bounds[3] } : undefined,
    maxZoom: 16,
    radius: 50,
  });

  // クラスターマーカー描画
  const markers = useMemo(() => {
    return clusters.map((cluster) => {
      const [longitude, latitude] = cluster.geometry.coordinates;
      const { cluster: isCluster, point_count, cluster_id, id, name, facilityType } = cluster.properties;

      if (isCluster) {
        // クラスターマーカー
        const size = getClusterSize(point_count!);
        const color = getClusterColor(point_count!);

        return (
          <Marker
            key={`cluster-${cluster_id}`}
            longitude={longitude}
            latitude={latitude}
            onClick={() => {
              const expansion = expandCluster(cluster_id!);
              if (expansion && onClusterClick) {
                onClusterClick(expansion.center, expansion.zoom);
              }
            }}
          >
            <div
              style={{
                width: size,
                height: size,
                borderRadius: '50%',
                backgroundColor: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: point_count! > 999 ? '12px' : '14px',
                cursor: 'pointer',
                border: '3px solid white',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {point_count! > 999 ? `${Math.floor(point_count! / 1000)}k+` : point_count}
            </div>
          </Marker>
        );
      } else {
        // 個別施設マーカー
        return (
          <Marker
            key={`facility-${id}`}
            longitude={longitude}
            latitude={latitude}
            onClick={() => {
              if (onFacilityClick) {
                onFacilityClick({
                  id: id!,
                  name: name!,
                  type: facilityType!,
                  coordinates: [longitude, latitude],
                });
              }
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: getFacilityColor(facilityType),
                border: '2px solid white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={name}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                <path d="M8 2a3 3 0 100 6 3 3 0 000-6zM4 12a4 4 0 018 0v2H4v-2z" />
              </svg>
            </div>
          </Marker>
        );
      }
    });
  }, [clusters, expandCluster, onClusterClick, onFacilityClick]);

  return <>{markers}</>;
}

/**
 * 施設種別に応じた色を返す
 */
function getFacilityColor(facilityType?: string): string {
  if (!facilityType) return '#6b7280'; // グレー（デフォルト）

  // 国土数値情報P15の施設種別コードに基づく色分け
  const typeColorMap: Record<string, string> = {
    '特別養護老人ホーム': '#dc2626', // 赤
    '介護老人保健施設': '#ea580c', // オレンジ
    '軽費老人ホーム': '#ca8a04', // 黄
    '有料老人ホーム': '#16a34a', // 緑
    '認知症高齢者グループホーム': '#0891b2', // シアン
    '小規模多機能型居宅介護': '#2563eb', // 青
    'デイサービスセンター': '#7c3aed', // 紫
  };

  // 部分一致で検索
  for (const [key, color] of Object.entries(typeColorMap)) {
    if (facilityType.includes(key)) {
      return color;
    }
  }

  return '#6b7280'; // デフォルト
}
