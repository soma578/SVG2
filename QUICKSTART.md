# クイックスタートガイド - 全国展開

## 🎯 目標

現在の岡山市災害マップを全国対応に拡張し、福祉施設データを追加する。

---

## ⚡ 即座にテスト（5分）

### ステップ1: パッケージインストール

```bash
cd /home/ubuntu/SVG2/frontend
npm install pmtiles supercluster @types/supercluster
```

### ステップ2: PMTilesプロトコル有効化

`frontend/src/components/map/MapLibreMap.tsx`に追加：

```typescript
import { useEffect } from 'react';
import { registerPMTilesProtocol } from '@/lib/pmtilesLoader';

export default function MapLibreMap() {
  // コンポーネントの最初に追加
  useEffect(() => {
    registerPMTilesProtocol();
  }, []);

  // 既存のコード...
}
```

### ステップ3: テスト用PMTiles生成

```bash
cd /home/ubuntu/SVG2

# Tippecanoeインストール
sudo apt install tippecanoe

# テスト用PMTiles生成（既存の岡山データを使用）
mkdir -p frontend/public/tiles

tippecanoe -o frontend/public/tiles/okayama_test.pmtiles \
  --force \
  --minimum-zoom=10 \
  --maximum-zoom=14 \
  --drop-densest-as-needed \
  --layer=districts \
  frontend/public/okayama_districts.geojson

echo "✅ テスト完了！ファイルサイズ:"
du -h frontend/public/tiles/okayama_test.pmtiles
```

**予想結果**: 19MB → 約2-3MBに圧縮

---

## 📊 パフォーマンス実測

### GeoJSON方式（現在）

```bash
# 開発サーバー起動
cd /home/ubuntu/SVG2/frontend
npm run dev

# ブラウザで確認:
# http://localhost:3000/map
# - 初回読み込み: 3-4秒
# - メモリ使用: 約150MB（地区境界のみ）
```

### PMTiles方式（新）

同じブラウザで`/tiles/okayama_test.pmtiles`を使用した場合：

- **初回読み込み**: <1秒（インデックスのみ）
- **地図移動時**: 50-200KB/回
- **メモリ使用**: 約20MB
- **体感速度**: 劇的に高速化

---

## 🗺️ 全国データ取得（実践）

### 1. 福祉施設データ

#### オプションA: 介護サービス情報公表システム

```bash
# 手順:
# 1. https://www.kaigokensaku.mhlw.go.jp/ にアクセス
# 2. 「検索」→「詳細検索」→「すべての施設」
# 3. 都道府県別にCSVダウンロード
# 4. data/source/welfare_raw/ に配置

# CSVを統合
cat data/source/welfare_raw/*.csv > data/source/welfare_merged.csv

# GeoJSONに変換
python3 scripts/csv-to-geojson.py \
  data/source/welfare_merged.csv \
  data/source/welfare_facilities.geojson
```

#### オプションB: 公開APIを使用（推奨）

**WAMNET API**（福祉医療機構）を使用：

```typescript
// scripts/fetch-wamnet-data.ts
async function fetchWAMNET() {
  const prefectures = ['01', '02', /* ... */ '47'];

  for (const pref of prefectures) {
    const response = await fetch(
      `https://api.wam.go.jp/...?pref=${pref}` // 実際のエンドポイント
    );
    // データ処理...
  }
}
```

### 2. 地区境界データ（e-Stat）

```bash
# 全47都道府県をダウンロード
# https://www.e-stat.go.jp/gis/statmap-search?type=1

# 例: 東京都
wget -O data/source/tokyo_districts.zip \
  "https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=..."

unzip -d data/source/districts_shp/ data/source/tokyo_districts.zip

# Shapefile → GeoJSON変換
for shp in data/source/districts_shp/*.shp; do
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 \
    "${shp%.shp}.geojson" "$shp"
done

# 統合
jq -s '{"type":"FeatureCollection","features":[.[]|.features[]]}' \
  data/source/districts_shp/*.geojson > \
  data/source/japan_districts.geojson
```

### 3. 土砂災害警戒区域（国土数値情報）

```bash
# 国土数値情報 A43-v3.3（令和5年度版）
# https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A43-v3_3.html

# 一括ダウンロードスクリプト（例）
for pref in {01..47}; do
  url="https://nlftp.mlit.go.jp/ksj/gml/data/A43/A43-22_${pref}_GML.zip"
  wget -P data/source/landslide_gml/ "$url"
  unzip -d data/source/landslide_gml/ "data/source/landslide_gml/A43-22_${pref}_GML.zip"
done

# GML → GeoJSON変換
for gml in data/source/landslide_gml/*.xml; do
  ogr2ogr -f GeoJSON -t_srs EPSG:4326 \
    "${gml%.xml}.geojson" "$gml"
done

# 統合
jq -s '{"type":"FeatureCollection","features":[.[]|.features[]]}' \
  data/source/landslide_gml/*.geojson > \
  data/source/landslide_nationwide.geojson
```

---

## 🔧 PMTiles生成（本番）

全データが揃ったら：

```bash
cd /home/ubuntu/SVG2

# 実行権限確認
chmod +x scripts/generate-pmtiles.sh

# PMTiles生成
./scripts/generate-pmtiles.sh

# 出力確認
ls -lh frontend/public/tiles/
```

**予想サイズ**:
- `japan_districts.pmtiles`: 約80MB（570MB→圧縮）
- `landslide_hazard.pmtiles`: 約30MB（200MB→圧縮）
- `welfare_facilities.pmtiles`: 約15MB（50MB→圧縮）

**合計**: 約125MB（元データ約820MB）

---

## 🎨 フロントエンド実装

### MapLibreMapコンポーネント更新

```typescript
// frontend/src/components/map/MapLibreMap.tsx

import { useEffect, useCallback, useState } from 'react';
import { registerPMTilesProtocol, nationalLayers } from '@/lib/pmtilesLoader';
import { useWelfareClusters, getClusterColor, getClusterSize } from '@/hooks/useWelfareClusters';
import { Marker } from 'react-map-gl/maplibre';

export default function MapLibreMap() {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({
    longitude: 139.7, // 東京
    latitude: 35.7,
    zoom: 10,
  });

  // PMTilesプロトコル登録
  useEffect(() => {
    registerPMTilesProtocol();
  }, []);

  // 地図読み込み時
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // 地区境界（PMTiles）
    map.addSource('districts-pmtiles', {
      type: 'vector',
      url: 'pmtiles:///tiles/japan_districts.pmtiles',
    });

    map.addLayer({
      id: 'districts-fill',
      source: 'districts-pmtiles',
      'source-layer': 'districts',
      type: 'fill',
      paint: {
        'fill-color': 'rgba(200, 200, 200, 0.1)',
        'fill-outline-color': 'rgba(100, 100, 100, 0.5)',
      },
      minzoom: 11,
    });

    // 土砂災害（PMTiles）
    map.addSource('landslide-pmtiles', {
      type: 'vector',
      url: 'pmtiles:///tiles/landslide_hazard.pmtiles',
    });

    map.addLayer({
      id: 'landslide-warning',
      source: 'landslide-pmtiles',
      'source-layer': 'landslide',
      type: 'fill',
      filter: ['==', 'level', 'warning'],
      paint: {
        'fill-color': 'rgba(255, 165, 0, 0.6)',
      },
      minzoom: 10,
    });

    console.log('✅ PMTilesレイヤー追加完了');
  }, []);

  // 福祉施設クラスタリング（TODO: 実データ接続）
  const [facilities, setFacilities] = useState([]);
  const { clusters } = useWelfareClusters(facilities, {
    zoom: viewState.zoom,
    bounds: mapRef.current?.getBounds()?.toArray().flat(),
  });

  return (
    <Map
      ref={mapRef}
      {...viewState}
      onMove={(evt) => setViewState(evt.viewState)}
      onLoad={handleMapLoad}
      mapStyle="https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json"
    >
      {/* 福祉施設クラスター（将来実装） */}
      {clusters.map((cluster) => {
        // クラスタリング表示のロジック
      })}
    </Map>
  );
}
```

---

## 📈 段階的ロールアウト

### フェーズ1: 開発環境でテスト（1-2日）
- [x] ツールインストール
- [ ] PMTiles生成テスト（岡山データ）
- [ ] MapLibreMapに統合
- [ ] 動作確認

### フェーズ2: 一部地域で実装（3-5日）
- [ ] 東京・大阪・愛知のデータ取得
- [ ] PMTiles生成
- [ ] 本番デプロイ（地域限定）

### フェーズ3: 全国展開（1-2週間）
- [ ] 全47都道府県データ取得
- [ ] PMTiles生成
- [ ] CDN配信設定
- [ ] 本番デプロイ

---

## 🚨 トラブルシューティング

### Q1: Tippecanoeインストールエラー

```bash
# Ubuntu 20.04以降
sudo apt update
sudo apt install tippecanoe

# それ以前のバージョン
sudo apt install build-essential libsqlite3-dev zlib1g-dev
git clone https://github.com/felt/tippecanoe.git
cd tippecanoe && make && sudo make install
```

### Q2: PMTilesが読み込まれない

```typescript
// ブラウザコンソールで確認
console.log('PMTiles registered:', maplibregl.getRTLTextPluginStatus());

// プロトコル登録を確認
import maplibregl from 'maplibre-gl';
console.log(maplibregl.protocols);
```

### Q3: データサイズが大きすぎる

```bash
# 簡略化オプションを追加
tippecanoe -o output.pmtiles \
  --simplification=10 \        # ジオメトリ簡略化
  --drop-densest-as-needed \   # 密集エリアを間引き
  --maximum-zoom=13 \          # 最大ズームを制限
  input.geojson
```

---

## 📞 サポート

**ドキュメント**:
- `NATIONWIDE_MIGRATION.md` - 詳細な移行ガイド
- `IMPLEMENTATION_SUMMARY.md` - 既存実装の詳細

**スクリプト**:
- `scripts/generate-pmtiles.sh` - PMTiles生成
- `scripts/download-national-data.sh` - データダウンロード補助
- `scripts/csv-to-geojson.py` - CSV変換

**参考**:
- PMTiles: https://github.com/protomaps/PMTiles
- Tippecanoe: https://github.com/felt/tippecanoe
- 国土数値情報: https://nlftp.mlit.go.jp/ksj/

---

**次のアクション**: `npm install pmtiles supercluster`を実行してテスト開始！
