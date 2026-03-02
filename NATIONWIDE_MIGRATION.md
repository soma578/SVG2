# 全国展開移行ガイド

**目的**: 現在の岡山市災害マップを全国対応に拡張
**戦略**: PMTiles（ベクタータイル）+ Supercluster（クラスタリング）
**対象データ**: 地区境界、ハザード、福祉施設

---

## 📊 パフォーマンス比較

### 現在（GeoJSON方式）

| データ | サイズ | 読み込み時間 | メモリ使用 |
|--------|--------|-------------|----------|
| 地区境界（岡山） | 19MB | 3-4秒 | 約150MB |
| 土砂災害（岡山） | 4.5MB | 1秒 | 約40MB |
| **合計** | **23.5MB** | **4-5秒** | **約190MB** |

### 全国展開（GeoJSON方式）

| データ | サイズ | 読み込み時間 | メモリ使用 |
|--------|--------|-------------|----------|
| 地区境界（全国） | 約570MB | 30-60秒 | 約4GB |
| 土砂災害（全国） | 約200MB | 15-30秒 | 約1.5GB |
| 福祉施設（全国） | 約50MB | 5-10秒 | 約400MB |
| **合計** | **約820MB** | **50-100秒** | **約5.9GB** |

❌ **実質的に不可能**（ブラウザのメモリ限界超過）

### PMTiles方式（提案）

| データ | PMTilesサイズ | 初回読み込み | 地図移動時 | メモリ使用 |
|--------|--------------|------------|----------|----------|
| 地区境界（全国） | 約80MB | 0秒* | 50-200KB/回 | 約20MB |
| 土砂災害（全国） | 約30MB | 0秒* | 30-100KB/回 | 約15MB |
| 福祉施設（全国） | 約15MB | 0秒* | 20-80KB/回 | 約10MB |
| **合計** | **約125MB** | **<1秒** | **100-380KB/回** | **約45MB** |

✅ **超高速**（表示領域のみ読み込み、CDN配信）

*初回はタイルインデックス（数KB）のみ読み込み

---

## 🛠️ セットアップ手順

### 1. 必要なパッケージをインストール

```bash
cd /home/ubuntu/SVG2/frontend

# PMTilesとSuperclusterをインストール
npm install pmtiles supercluster
npm install --save-dev @types/supercluster

# Tippecanoe（タイル生成ツール）をシステムにインストール
# Ubuntu/WSL:
sudo apt update
sudo apt install tippecanoe

# Mac:
# brew install tippecanoe
```

### 2. データ取得とタイル生成

```bash
cd /home/ubuntu/SVG2

# スクリプトに実行権限を付与
chmod +x scripts/generate-pmtiles.sh

# データソースをdata/sourceに配置（後述）
# - japan_districts.geojson（全国町丁目境界）
# - welfare_facilities.geojson（全国福祉施設）
# - landslide_nationwide.geojson（全国土砂災害）

# PMTilesを生成
./scripts/generate-pmtiles.sh
```

### 3. MapLibreMapコンポーネントを更新

```typescript
// frontend/src/components/map/MapLibreMap.tsx

import { useEffect } from 'react';
import { registerPMTilesProtocol, nationalLayers } from '@/lib/pmtilesLoader';
import { useWelfareClusters, getClusterColor, getClusterSize } from '@/hooks/useWelfareClusters';
import { Marker } from 'react-map-gl/maplibre';

export default function MapLibreMap() {
  const mapRef = useRef<MapRef>(null);

  // PMTilesプロトコル登録（初回のみ）
  useEffect(() => {
    registerPMTilesProtocol();
  }, []);

  // 地図読み込み時にPMTilesソースとレイヤーを追加
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // 地区境界レイヤー（PMTiles）
    map.addSource('districts-pmtiles', {
      type: 'vector',
      url: 'pmtiles:///tiles/japan_districts.pmtiles',
    });

    nationalLayers.districts.layers.forEach((layerConfig) => {
      map.addLayer({
        id: layerConfig.id,
        source: 'districts-pmtiles',
        'source-layer': layerConfig.sourceLayer,
        type: layerConfig.type,
        paint: layerConfig.paint,
        minzoom: layerConfig.minzoom,
      });
    });

    // 土砂災害レイヤー（PMTiles）
    map.addSource('landslide-pmtiles', {
      type: 'vector',
      url: 'pmtiles:///tiles/landslide_hazard.pmtiles',
    });

    nationalLayers.landslide.layers.forEach((layerConfig) => {
      map.addLayer({
        id: layerConfig.id,
        source: 'landslide-pmtiles',
        'source-layer': layerConfig.sourceLayer,
        type: layerConfig.type,
        filter: layerConfig.filter,
        paint: layerConfig.paint,
        minzoom: layerConfig.minzoom,
      });
    });

    console.log('✅ PMTilesレイヤー追加完了');
  }, []);

  // 福祉施設クラスタリング（デモ用データ）
  const [facilities, setFacilities] = useState([]);
  const { clusters, expandCluster, getClusterLeaves } = useWelfareClusters(facilities, {
    zoom: viewState.zoom,
    bounds: mapRef.current?.getBounds()?.toArray().flat(),
  });

  return (
    <Map
      ref={mapRef}
      onLoad={handleMapLoad}
      {...otherProps}
    >
      {/* 福祉施設クラスターマーカー */}
      {clusters.map((cluster) => {
        const [longitude, latitude] = cluster.geometry.coordinates;
        const { cluster: isCluster, point_count, id } = cluster.properties;

        if (isCluster) {
          return (
            <Marker
              key={`cluster-${cluster.properties.cluster_id}`}
              longitude={longitude}
              latitude={latitude}
              onClick={() => {
                const expansion = expandCluster(cluster.properties.cluster_id!);
                if (expansion) {
                  mapRef.current?.flyTo({
                    center: expansion.center,
                    zoom: expansion.zoom,
                  });
                }
              }}
            >
              <div
                style={{
                  width: getClusterSize(point_count!),
                  height: getClusterSize(point_count!),
                  borderRadius: '50%',
                  backgroundColor: getClusterColor(point_count!),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: '2px solid white',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}
              >
                {point_count}
              </div>
            </Marker>
          );
        }

        // 個別施設マーカー
        return (
          <Marker
            key={`facility-${id}`}
            longitude={longitude}
            latitude={latitude}
            onClick={() => handleFacilityClick(cluster.properties)}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#3b82f6',
                border: '2px solid white',
                cursor: 'pointer',
              }}
            />
          </Marker>
        );
      })}
    </Map>
  );
}
```

---

## 📁 データソースと取得方法

### 1. 全国町丁目境界（e-Stat）

**ソース**: [e-Stat 小地域境界データ](https://www.e-stat.go.jp/gis/statmap-search?type=1)

**取得手順**:
1. e-Statから都道府県別にダウンロード（Shapefile形式）
2. GeoJSONに変換（`ogr2ogr`使用）
3. 統合して`japan_districts.geojson`作成

```bash
# Shapefile → GeoJSON変換例
ogr2ogr -f GeoJSON -t_srs EPSG:4326 \
  tokyo_districts.geojson \
  h27ka13.shp

# 複数ファイルを統合（jqを使用）
jq -s '{"type":"FeatureCollection","features":[.[]|.features[]]}' \
  pref*.geojson > japan_districts.geojson
```

### 2. 福祉施設データ（厚生労働省）

**ソース候補**:
- [介護サービス情報公表システム](https://www.kaigokensaku.mhlw.go.jp/)
- [WAM NET（福祉医療機構）](https://www.wam.go.jp/)
- 各都道府県オープンデータポータル

**データ形式**: CSV（施設名、住所、緯度経度、種別等）

**変換スクリプト**: `scripts/csv-to-geojson.py`

```python
import pandas as pd
import json

# CSVを読み込み
df = pd.read_csv('welfare_facilities.csv')

# GeoJSON形式に変換
features = []
for _, row in df.iterrows():
    feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [row['lon'], row['lat']]
        },
        "properties": {
            "id": row['id'],
            "name": row['name'],
            "type": row['type'],
            "address": row['address'],
        }
    }
    features.append(feature)

geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open('welfare_facilities.geojson', 'w', encoding='utf-8') as f:
    json.dump(geojson, f, ensure_ascii=False, indent=2)
```

### 3. 土砂災害警戒区域（国土数値情報）

**ソース**: [国土数値情報ダウンロードサービス A43](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A43.html)

**取得手順**:
1. 都道府県別にGMLファイルをダウンロード
2. GeoJSONに変換
3. 統合

```bash
# GML → GeoJSON変換
ogr2ogr -f GeoJSON -t_srs EPSG:4326 \
  landslide_tokyo.geojson \
  A43-20_13.xml

# 統合
jq -s '{"type":"FeatureCollection","features":[.[]|.features[]]}' \
  landslide_*.geojson > landslide_nationwide.geojson
```

---

## 🔧 既存コードとの互換性

### レイヤーIDマッピング

既存の`LayerPanel`で使用しているレイヤーIDに対応させます：

```typescript
// frontend/src/lib/layerProfiles.ts

export const layerProfiles = {
  // 既存のGeoJSON方式（開発環境）
  districts_legacy: {
    url: '/okayama_districts.geojson',
    type: 'geojson',
  },

  // 新しいPMTiles方式（本番環境）
  districts: {
    url: '/tiles/japan_districts.pmtiles',
    type: 'pmtiles',
    sourceLayer: 'districts',
  },

  landslide: {
    url: '/tiles/landslide_hazard.pmtiles',
    type: 'pmtiles',
    sourceLayer: 'landslide',
  },

  // クラスタリング表示（クライアント側処理）
  welfare: {
    type: 'cluster',
    // データはuseWelfareClustersフックで管理
  },
};
```

### 環境変数での切り替え

```bash
# .env.local

# 開発環境: GeoJSON方式（岡山のみ）
NEXT_PUBLIC_USE_PMTILES=false
NEXT_PUBLIC_REGION=okayama

# 本番環境: PMTiles方式（全国）
NEXT_PUBLIC_USE_PMTILES=true
NEXT_PUBLIC_REGION=nationwide
```

---

## 📈 段階的移行プラン

### フェーズ1: 準備（1-2日）
- [x] スクリプト作成完了
- [ ] Tippecanoeインストール
- [ ] データソース調査・ダウンロード
- [ ] テスト用PMTiles生成（東京都のみ）

### フェーズ2: 実装（2-3日）
- [ ] PMTilesローダー実装
- [ ] Superclusterクラスタリング実装
- [ ] MapLibreMapコンポーネント統合
- [ ] レイヤー切替UI対応

### フェーズ3: データ整備（3-5日）
- [ ] 全国地区境界データ取得・変換
- [ ] 福祉施設データ取得・変換
- [ ] 全国ハザードデータ取得・変換
- [ ] PMTiles生成・最適化

### フェーズ4: テスト・最適化（2-3日）
- [ ] パフォーマンステスト
- [ ] メモリ使用量確認
- [ ] クラスタリング動作確認
- [ ] モバイル対応確認

### フェーズ5: デプロイ（1日）
- [ ] PMTilesファイルをCDNにアップロード
- [ ] Vercel/Cloudflareデプロイ
- [ ] 本番環境テスト
- [ ] ドキュメント更新

**合計**: 約10-15日

---

## 💡 追加の最適化案

### 1. CDN配信

PMTilesファイルをCloudflare R2やVercel Blob Storageに配置：

```typescript
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: '/tiles/:path*',
        destination: 'https://cdn.example.com/tiles/:path*',
      },
    ];
  },
};
```

### 2. サーバーサイドPIP判定（オプション）

クライアント側のPIP判定が重い場合、APIエンドポイント化：

```typescript
// pages/api/analyze-risk.ts
import { point, polygon } from '@turf/helpers';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

export default async function handler(req, res) {
  const { lat, lon } = req.query;

  // PostGISを使ったクエリ（最速）
  const result = await db.query(`
    SELECT
      d.name as district_name,
      l.level as landslide_level
    FROM districts d
    LEFT JOIN landslide l ON ST_Contains(l.geom, d.geom)
    WHERE ST_Contains(d.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
  `, [lon, lat]);

  res.json(result.rows[0] || {});
}
```

### 3. WebWorkerでのクラスタリング

メインスレッドをブロックしないように：

```typescript
// workers/clustering.worker.ts
import Supercluster from 'supercluster';

self.addEventListener('message', (e) => {
  const { facilities, zoom, bounds } = e.data;

  const cluster = new Supercluster({ maxZoom: 16, radius: 50 });
  cluster.load(facilities);

  const clusters = cluster.getClusters(bounds, zoom);

  self.postMessage({ clusters });
});
```

---

## 🚨 注意事項

### データライセンス確認

- e-Stat: CC BY 4.0（出典明記必須）
- 国土数値情報: 利用規約に従う（商用利用可）
- 厚労省データ: 各データセットのライセンスを確認

### パフォーマンスモニタリング

```typescript
// デバッグパネルに追加
{
  tileLoadTime: number;        // タイル読み込み時間
  clusteringTime: number;      // クラスタリング処理時間
  renderingTime: number;       // レンダリング時間
  activeTiles: number;         // 現在読み込み中のタイル数
  memoryUsage: number;         // メモリ使用量（MB）
}
```

---

## 📚 参考リンク

- [PMTiles仕様](https://github.com/protomaps/PMTiles)
- [Tippecanoeドキュメント](https://github.com/felt/tippecanoe)
- [Supercluster](https://github.com/mapbox/supercluster)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)
- [国土数値情報](https://nlftp.mlit.go.jp/ksj/)
- [e-Stat](https://www.e-stat.go.jp/)

---

**次のステップ**: データソースの調査とテスト用PMTiles生成
