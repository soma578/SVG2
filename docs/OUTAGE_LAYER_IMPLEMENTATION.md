# 停電レイヤー実装ガイド

## 概要

このドキュメントは、岡山防災マップに停電情報レイヤーを実装するための完全なガイドです。

## アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│              フロントエンド                        │
│  ┌──────────────────────────────────────────┐  │
│  │  MapLibreMap.tsx                         │  │
│  │  ├─ useDistrictLayers (遅延ロード)       │  │
│  │  ├─ ズーム監視                            │  │
│  │  └─ 停電情報取得                          │  │
│  └──────────────────────────────────────────┘  │
│              ↓ fetch                            │
│  ┌──────────────────────────────────────────┐  │
│  │  /districts/*.geojson (分割ファイル)      │  │
│  │  /okayama_district_dict.json (辞書)      │  │
│  │  /api/outages (停電情報API)              │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## ファイル構成

### データファイル（frontend/public/）

#### 地区境界（分割済み、合計14.59MB）
```
districts/
├── districts_metadata.json          # メタデータ
├── okayama_districts_okayama_city_high.geojson   # 岡山市・高ズーム（1.3MB）
├── okayama_districts_okayama_city_low.geojson    # 岡山市・低ズーム（637KB）
├── okayama_districts_kurashiki_high.geojson      # 倉敷市・高ズーム（855KB）
├── okayama_districts_kurashiki_low.geojson       # 倉敷市・低ズーム（426KB）
├── okayama_districts_other_cities_high.geojson   # その他市・高ズーム（6.0MB）
├── okayama_districts_other_cities_low.geojson    # その他市・低ズーム（2.7MB）
├── okayama_districts_towns_high.geojson          # 町村・高ズーム（2.1MB）
└── okayama_districts_towns_low.geojson           # 町村・低ズーム（953KB）
```

#### 辞書ファイル
```
okayama_district_dict.json       # 地区辞書（1.5MB）
okayama_n03_dict.json            # 市区町村辞書（5.8KB）
okayama_city_fallback.json       # フォールバック辞書（665B）
```

#### 市区町村境界（軽量版）
```
okayama_municipalities_simple.geojson  # 166KB
```

### フロントエンドコード

```
frontend/src/
├── hooks/
│   └── useDistrictLayers.ts          # 遅延ロードHook
├── lib/
│   ├── outageMapper.ts               # 停電マッピングユーティリティ
│   ├── layers.ts                     # レイヤー定義（更新済み）
│   └── layerProfiles.ts              # レイヤープロファイル（更新済み）
└── components/map/
    ├── MapLibreMap.tsx               # 地図コンポーネント（要実装）
    └── LayerPanel.tsx                # レイヤーパネル（更新済み）
```

## 実装手順

### Step 1: MapLibreMap.tsxでHookを使用

```typescript
import { useDistrictLayers } from '@/hooks/useDistrictLayers'

function MapLibreMap({ activeLayers, showSidebar }: MapLibreMapProps) {
  const [viewport, setViewport] = useState({
    longitude: 133.93,
    latitude: 34.66,
    zoom: 11,
  })

  // 地区境界の遅延ロード
  const {
    geojson: districtsGeoJSON,
    loading: districtsLoading,
    featureCount
  } = useDistrictLayers(viewport.zoom, activeLayers.districts || activeLayers.outages)

  return (
    <Map
      {...viewport}
      onMove={(evt) => setViewport(evt.viewState)}
      mapLib={maplibregl}
      mapStyle="https://gsi-cyberjapan.github.io/gsivectortile-mapbox-gl-js/pale.json"
    >
      {/* 地区境界レイヤー（ズーム11+） */}
      {activeLayers.districts && districtsGeoJSON && (
        <Source
          id="districts-source"
          type="geojson"
          data={districtsGeoJSON}
        >
          <Layer
            id="districts-layer"
            type="line"
            paint={{
              'line-color': '#9ca3af',
              'line-width': 1,
              'line-opacity': 0.5,
            }}
          />
        </Source>
      )}

      {/* 停電レイヤー（ズーム11+） */}
      {activeLayers.outages && districtsGeoJSON && (
        <Source
          id="outages-source"
          type="geojson"
          data={districtsGeoJSON}
        >
          <Layer
            id="outages-fill"
            type="fill"
            paint={{
              'fill-color': [
                'case',
                ['get', 'outage'],  // properties.outage が true なら
                '#ef4444',           // 赤
                'transparent'        // それ以外は透明
              ],
              'fill-opacity': 0.6,
            }}
          />
          <Layer
            id="outages-outline"
            type="line"
            paint={{
              'line-color': [
                'case',
                ['get', 'outage'],
                '#b91c1c',
                'transparent'
              ],
              'line-width': 2,
            }}
          />
        </Source>
      )}
    </Map>
  )
}
```

### Step 2: 停電情報APIの実装

```typescript
// frontend/src/app/api/outages/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  // 実際の停電情報APIを呼び出す
  // 例: 中国電力、地方自治体のAPI等

  // デモ用のモックデータ
  const mockOutages = [
    {
      prefecture: "岡山県",
      city: "岡山市",
      ward: "北区",
      district: "京山1丁目",
      households: 120,
      timestamp: new Date().toISOString()
    },
    {
      prefecture: "岡山県",
      city: "倉敷市",
      district: "阿知1丁目",
      households: 85,
      timestamp: new Date().toISOString()
    }
  ]

  return NextResponse.json(mockOutages)
}
```

### Step 3: 停電情報のマッピングと表示

```typescript
import { useEffect, useState } from 'react'
import { applyOutagesToMap } from '@/lib/outageMapper'

function MapLibreMap({ ... }) {
  const [outageInfo, setOutageInfo] = useState<any[]>([])

  // 停電情報の取得（定期的にポーリング）
  useEffect(() => {
    if (!activeLayers.outages) return

    const fetchOutages = async () => {
      try {
        const response = await fetch('/api/outages')
        const data = await response.json()
        setOutageInfo(data)
      } catch (err) {
        console.error('Failed to fetch outage data:', err)
      }
    }

    fetchOutages()
    const interval = setInterval(fetchOutages, 60000) // 1分ごと

    return () => clearInterval(interval)
  }, [activeLayers.outages])

  // 停電情報を地図に反映（GeoJSONのpropertiesを更新）
  useEffect(() => {
    if (!districtsGeoJSON || outageInfo.length === 0) return

    // 辞書を読み込む
    Promise.all([
      fetch('/okayama_district_dict.json').then(r => r.json()),
      fetch('/okayama_n03_dict.json').then(r => r.json())
    ]).then(([districtDict, municipalityDict]) => {
      // GeoJSONのfeaturesを更新
      const updatedGeoJSON = {
        ...districtsGeoJSON,
        features: districtsGeoJSON.features.map((feature: any) => {
          // 停電情報とマッチするかチェック
          const isOutage = outageInfo.some(outage => {
            // key_codeでマッチング
            const normalizedKey = `${outage.prefecture}|${outage.city}|${outage.ward || ''}|${outage.district || ''}`
            return districtDict[normalizedKey]?.key_code === feature.properties.key_code
          })

          return {
            ...feature,
            properties: {
              ...feature.properties,
              outage: isOutage
            }
          }
        })
      }

      // Source dataを更新（MapLibreが自動的に再描画）
      // Note: Sourceの更新方法はreact-map-glのバージョンによる
    })
  }, [districtsGeoJSON, outageInfo])
}
```

## パフォーマンス最適化

### 1. ズーム閾値の設定

- **ズーム10以下**: レイヤー非表示
- **ズーム11-13**: 低ズーム版（簡略化済み）
- **ズーム14+**: 高ズーム版（詳細）

### 2. エリア別分割

現在の実装では全エリアをロードしていますが、将来的には表示範囲（bbox）で必要なエリアだけをロードすることも可能です。

### 3. キャッシュ戦略

```typescript
// useDistrictLayers内でキャッシュを実装済み
// 一度ロードしたGeoJSONはMapに保持
// ズームレベルが変わって不要になったら削除
```

### 4. メモリ管理

```typescript
// 不要になったレイヤーは自動的に削除
const requiredKeys = new Set(required.map(r => `${r.areaId}_${r.zoomLevel}`))
for (const key of newLayers.keys()) {
  if (!requiredKeys.has(key)) {
    newLayers.delete(key)
  }
}
```

## トラブルシューティング

### Q1: 地区境界が表示されない

**確認事項**:
1. ズームレベルが11以上か？
2. レイヤーがONになっているか？
3. ブラウザコンソールでロードエラーが出ていないか？
4. NetworkタブでGeoJSONが正しくロードされているか？

### Q2: ロードが遅い

**対策**:
1. さらに簡略化度を上げる（tolerance値を大きくする）
2. エリア分割を細かくする（岡山市を北区・中区等に分割）
3. CDNを使用する

### Q3: 停電情報が反映されない

**確認事項**:
1. `/api/outages`が正しくデータを返しているか？
2. 辞書ファイルが正しくロードされているか？
3. 正規化処理が正しく動作しているか？（全角/半角）
4. `key_code`が一致しているか？

## 今後の拡張

### ベクトルタイル（MVT）への移行

現在の実装で十分に軽量ですが、さらなる最適化が必要な場合：

```bash
# tippecanoeでMVT生成
tippecanoe -o okayama_districts.mbtiles \
  -Z11 -z16 \
  -l districts \
  --drop-densest-as-needed \
  frontend/public/districts/*.geojson
```

### リアルタイム更新

WebSocketやServer-Sent Eventsで停電情報をリアルタイム配信：

```typescript
useEffect(() => {
  const eventSource = new EventSource('/api/outages/stream')

  eventSource.onmessage = (event) => {
    const newOutages = JSON.parse(event.data)
    setOutageInfo(newOutages)
  }

  return () => eventSource.close()
}, [])
```

## 参考資料

- [MapLibre GL JS - GeoJSON Source](https://maplibre.org/maplibre-gl-js/docs/API/types/GeoJSONSourceSpecification/)
- [Shapely - Simplification](https://shapely.readthedocs.io/en/stable/manual.html#object.simplify)
- [Douglas-Peucker Algorithm](https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm)

---

**作成日**: 2026-01-16
**バージョン**: 1.0
