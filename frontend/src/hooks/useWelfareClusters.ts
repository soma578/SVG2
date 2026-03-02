/**
 * 福祉施設のクラスタリング表示
 */

import { useState, useEffect, useMemo } from 'react';
import Supercluster from 'supercluster';

interface WelfareFacility {
  id: string;
  name: string;
  type: string;
  coordinates: [number, number]; // [lon, lat]
  prefName?: string;
  cityName?: string;
  address?: string;
  capacity?: number;
}

interface ClusterFeature {
  type: 'Feature';
  properties: {
    cluster: boolean;
    cluster_id?: number;
    point_count?: number;
    point_count_abbreviated?: string;
    // 個別施設の場合
    id?: string;
    name?: string;
    facilityType?: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

interface UseWelfareClustersOptions {
  zoom: number;
  bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  maxZoom?: number;
  radius?: number;
}

/**
 * 福祉施設のクラスタリング管理フック
 */
export function useWelfareClusters(
  facilities: WelfareFacility[],
  options: UseWelfareClustersOptions
) {
  const { zoom, bounds, maxZoom = 16, radius = 50 } = options;

  // Superclusterインスタンス
  const supercluster = useMemo(() => {
    if (facilities.length === 0) return null;

    const cluster = new Supercluster<WelfareFacility>({
      maxZoom,
      radius,
      extent: 512,
      nodeSize: 64,
    });

    // GeoJSON形式に変換
    const points: GeoJSON.Feature<GeoJSON.Point, WelfareFacility>[] = facilities.map((facility) => ({
      type: 'Feature',
      properties: facility,
      geometry: {
        type: 'Point',
        coordinates: facility.coordinates,
      },
    }));

    cluster.load(points);
    return cluster;
  }, [facilities, maxZoom, radius]);

  // 表示するクラスター/ポイントを取得
  const clusters = useMemo(() => {
    if (!supercluster || !bounds) return [];

    return supercluster.getClusters(
      [bounds.west, bounds.south, bounds.east, bounds.north],
      Math.floor(zoom)
    ) as ClusterFeature[];
  }, [supercluster, bounds, zoom]);

  /**
   * クラスターを展開（ズームイン先の座標とズームレベルを計算）
   */
  const expandCluster = (clusterId: number): { center: [number, number]; zoom: number } | null => {
    if (!supercluster) return null;

    const expansionZoom = supercluster.getClusterExpansionZoom(clusterId);
    const leaves = supercluster.getLeaves(clusterId, 1);

    if (leaves.length === 0) return null;

    return {
      center: leaves[0].geometry.coordinates as [number, number],
      zoom: expansionZoom,
    };
  };

  /**
   * クラスター内の施設一覧を取得
   */
  const getClusterLeaves = (clusterId: number, limit = 10): WelfareFacility[] => {
    if (!supercluster) return [];

    const leaves = supercluster.getLeaves(clusterId, limit);
    return leaves.map((leaf) => leaf.properties);
  };

  return {
    clusters,
    expandCluster,
    getClusterLeaves,
    totalCount: facilities.length,
  };
}

/**
 * 福祉施設データを動的に取得（表示領域ベース）
 */
export function useFetchWelfareFacilities(bounds?: {
  west: number;
  south: number;
  east: number;
  north: number;
}) {
  const [facilities, setFacilities] = useState<WelfareFacility[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bounds) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // PMTilesから直接読み込む場合はこの実装は不要
        // APIから取得する場合は以下のようなエンドポイントを実装
        const response = await fetch(
          `/api/welfare?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch welfare facilities');
        }

        const data = await response.json();
        setFacilities(data.facilities || []);
      } catch (error) {
        console.error('Error fetching welfare facilities:', error);
        setFacilities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [bounds]);

  return { facilities, loading };
}

/**
 * クラスターポイントのカラーを計算
 */
export function getClusterColor(pointCount: number): string {
  if (pointCount < 10) return '#51bbd6';
  if (pointCount < 50) return '#f1f075';
  if (pointCount < 100) return '#f28cb1';
  return '#dc2626';
}

/**
 * クラスターポイントのサイズを計算
 */
export function getClusterSize(pointCount: number): number {
  const baseSize = 40;
  const scale = Math.min(Math.log10(pointCount) * 10, 40);
  return baseSize + scale;
}
