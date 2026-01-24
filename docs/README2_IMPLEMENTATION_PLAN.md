# README2 実装プラン

## 概要

このドキュメントは、README2.mdに記載されたSVGMap設計思想を現在のNext.js + React実装に適用するための具体的な実装計画です。

## 実装の方針

### SVGMapの独自価値を活かす

README2で定義された以下の価値を実装に反映します：

1. **任意の地図を同一座標系で重ねる** - レイヤーの透明度・順序・合成
2. **点・線・面を「意味」や「状態」で可視化** - CSS駆動のスタイル切替
3. **空間的関係の判断支援** - 危険エリア判定、安全圏の可視化

### 勝ち筋

**防災×ももちゃり×避難所（意思決定支援）**

Google Mapsの「最短経路」ではなく、「災害時の意思決定」を支援する地図を構築します。

---

## フェーズ別実装計画

### フェーズ1: ももちゃりレイヤーの追加（1-2日）

#### 1.1 APIエンドポイントの作成

**ファイル**: `frontend/src/app/api/momochari/route.ts`

```typescript
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import iconv from 'iconv-lite'

interface MomochariPort {
  id: string
  name: string
  address: string
  lon: number
  lat: number
}

export async function GET() {
  const csvPath = path.join(process.cwd(), '..', 'opendata_1539.csv')
  const buffer = fs.readFileSync(csvPath)

  // 文字コード判定（sheltersと同じロジック）
  let content: string
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    content = buffer.toString('utf-8')
  } else {
    content = iconv.decode(buffer, 'UTF-8')
  }

  const lines = content.trim().split('\n')
  const ports: MomochariPort[] = []

  // ヘッダーをスキップして処理
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const values = line.split(',')

    if (values.length >= 6) {
      const name = values[0].replace(/<br>/g, '').trim()
      const address = values[1].trim()
      const lon = parseFloat(values[4])
      const lat = parseFloat(values[5])

      if (!isNaN(lon) && !isNaN(lat)) {
        ports.push({
          id: `momochari-${i}`,
          name,
          address,
          lon,
          lat,
        })
      }
    }
  }

  return NextResponse.json(ports)
}
```

#### 1.2 TypeScript型定義の追加

**ファイル**: `frontend/src/types/index.ts` に追加

```typescript
export interface MomochariPort {
  id: string
  name: string
  address: string
  lon: number
  lat: number
  floodRank?: number  // 災害ランク（後のフェーズで使用）
  landslideRank?: number
}
```

#### 1.3 MapCanvasでのデータ取得と描画

**ファイル**: `frontend/src/components/map/MapCanvas.tsx`

以下の追加が必要：

1. State追加
```typescript
const [momochariPorts, setMomochariPorts] = useState<MomochariPort[]>([])
```

2. データ取得
```typescript
useEffect(() => {
  fetch('/api/momochari')
    .then(res => res.json())
    .then(data => setMomochariPorts(data))
    .catch(err => console.error('Failed to load momochari ports:', err))
}, [])
```

3. 描画ロジック（既存のshelters描画と同様）
```typescript
const projectedMomochari = useMemo(() => {
  if (!projection) return []
  return momochariPorts.map(port => {
    const point = projection.projectPoint(port.lat, port.lon)
    return point ? { ...port, ...point } : null
  }).filter(Boolean)
}, [momochariPorts, projection])
```

4. レンダリング（自転車アイコンで描画）
```tsx
{activeLayers.bikes && projectedMomochari.map((port) => (
  <button
    key={port.id}
    className="absolute"
    style={{
      left: `${port.x}px`,
      top: `${port.y}px`,
      transform: 'translate(-50%, -100%)',
    }}
    onClick={() => handleMomochariClick(port)}
  >
    <Image
      src="/tutorials/tutorial1/img/bike-icon.png"
      alt={port.name}
      width={24}
      height={24}
    />
  </button>
))}
```

---

### フェーズ2: モード切替機能の実装（1-3日）

#### 2.1 モード定義

**ファイル**: `frontend/src/lib/modes.ts` (新規作成)

```typescript
export type MapMode = 'normal' | 'rain-alert' | 'flood-emergency'

export interface ModeConfig {
  id: MapMode
  label: string
  description: string
  defaultLayers: Record<string, boolean>
  cssClass: string
}

export const mapModes: Record<MapMode, ModeConfig> = {
  'normal': {
    id: 'normal',
    label: '平常時',
    description: '通常の地図表示',
    defaultLayers: {
      basemap: true,
      spots: true,
      bikes: true,
      weather: false,
      landslide: false,
      rivers: false,
      hospitals: false,
      schools: false,
    },
    cssClass: 'mode-normal',
  },
  'rain-alert': {
    id: 'rain-alert',
    label: '大雨警戒',
    description: 'ハザード情報を薄く表示',
    defaultLayers: {
      basemap: true,
      spots: true,
      bikes: true,
      landslide: true,
      rivers: true,
      weather: false,
      hospitals: false,
      schools: false,
    },
    cssClass: 'mode-rain-alert',
  },
  'flood-emergency': {
    id: 'flood-emergency',
    label: '洪水発生',
    description: '危険ポートを非表示、安全ポートを強調',
    defaultLayers: {
      basemap: true,
      spots: true,
      bikes: true,
      landslide: true,
      rivers: true,
      realShelters: true,
      weather: false,
      hospitals: false,
      schools: false,
    },
    cssClass: 'mode-flood-emergency',
  },
}
```

#### 2.2 モード切替UIの追加

**ファイル**: `frontend/src/components/map/ModeSelector.tsx` (新規作成)

```typescript
import { MapMode, mapModes } from '@/lib/modes'

interface ModeSelectorProps {
  currentMode: MapMode
  onModeChange: (mode: MapMode) => void
}

export default function ModeSelector({ currentMode, onModeChange }: ModeSelectorProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        表示モード
      </h3>
      <div className="space-y-2">
        {Object.values(mapModes).map((mode) => (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            className={`w-full text-left px-3 py-2 rounded transition ${
              currentMode === mode.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <div className="font-semibold">{mode.label}</div>
            <div className="text-xs opacity-75">{mode.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

#### 2.3 MapPageでのモード管理

**ファイル**: `frontend/src/app/map/page.tsx` に追加

```typescript
import { useState } from 'react'
import { MapMode, mapModes } from '@/lib/modes'
import ModeSelector from '@/components/map/ModeSelector'

// 既存のコードに追加
const [currentMode, setCurrentMode] = useState<MapMode>('normal')

const handleModeChange = (mode: MapMode) => {
  setCurrentMode(mode)
  // モードに応じてレイヤーを自動切り替え
  setActiveLayers(mapModes[mode].defaultLayers)
}

// レイアウトに ModeSelector を追加
<ModeSelector currentMode={currentMode} onModeChange={handleModeChange} />
```

---

### フェーズ3: 災害ランク計算とCSS切替（3-5日）

#### 3.1 災害ランク計算スクリプト

**ファイル**: `scripts/calculate_disaster_rank.py` (新規作成)

```python
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

# ももちゃりCSV読み込み
ports_df = pd.read_csv('../opendata_1539.csv', encoding='utf-8')
ports_gdf = gpd.GeoDataFrame(
    ports_df,
    geometry=gpd.points_from_xy(ports_df['経度'], ports_df['緯度']),
    crs='EPSG:4326'
)

# 洪水ハザードGeoJSON読み込み
flood_gdf = gpd.read_file('../frontend/public/okayama_landslide.geojson')

# 空間結合（ポートが浸水区域内にあるか判定）
joined = gpd.sjoin(ports_gdf, flood_gdf, how='left', predicate='within')

# ランク付け（例: 浸水深に応じて0-3）
def calculate_flood_rank(row):
    if pd.isna(row['A33_007']):  # ハザード区域外
        return 0
    # 浸水深などの属性から判定
    # 仮の実装: 特別警戒区域=3, 警戒区域=2, その他=1
    hazard_type = row['A33_007']
    if '特別警戒' in str(hazard_type):
        return 3
    elif '警戒' in str(hazard_type):
        return 2
    else:
        return 1

joined['flood_rank'] = joined.apply(calculate_flood_rank, axis=1)

# 結果をJSON出力
output = joined[['ポート名', '経度', '緯度', 'flood_rank']].copy()
output.to_json('../frontend/public/momochari_with_rank.json',
               orient='records', force_ascii=False, indent=2)

print("災害ランク計算完了: momochari_with_rank.json")
```

#### 3.2 ランク付きデータの読み込み

**ファイル**: `frontend/src/app/api/momochari/route.ts` を修正

```typescript
// JSONファイルが存在する場合はそちらを優先
const rankJsonPath = path.join(process.cwd(), 'public', 'momochari_with_rank.json')
if (fs.existsSync(rankJsonPath)) {
  const data = JSON.parse(fs.readFileSync(rankJsonPath, 'utf-8'))
  return NextResponse.json(data)
}
```

#### 3.3 CSS切替による表示制御

**ファイル**: `frontend/src/app/globals.css` に追加

```css
/* 平常時 */
.mode-normal .momochari-port {
  opacity: 1;
  filter: none;
}

/* 大雨警戒時: 危険ポートを半透明 */
.mode-rain-alert .momochari-port[data-flood-rank="2"],
.mode-rain-alert .momochari-port[data-flood-rank="3"] {
  opacity: 0.5;
  filter: saturate(0.5);
}

/* 洪水発生時: 危険ポートを非表示、安全ポートを強調 */
.mode-flood-emergency .momochari-port[data-flood-rank="3"] {
  display: none;
  pointer-events: none;
}

.mode-flood-emergency .momochari-port[data-flood-rank="2"] {
  opacity: 0.3;
  filter: grayscale(1);
}

.mode-flood-emergency .momochari-port[data-flood-rank="0"] {
  filter: drop-shadow(0 0 4px rgba(34, 197, 94, 0.8));
  animation: pulse-safe 2s ease-in-out infinite;
}

@keyframes pulse-safe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
```

#### 3.4 MapCanvasでのクラス適用

```tsx
<div className={`map-container ${mapModes[currentMode].cssClass}`}>
  {projectedMomochari.map((port) => (
    <button
      key={port.id}
      className="momochari-port absolute"
      data-flood-rank={port.floodRank || 0}
      // ... 残りのprops
    >
      {/* アイコン */}
    </button>
  ))}
</div>
```

---

### フェーズ4: ボロノイ図（勢力圏）の実装（3-5日）

#### 4.1 d3-delaunayのインストール

```bash
cd frontend
npm install d3-delaunay
```

#### 4.2 ボロノイ計算コンポーネント

**ファイル**: `frontend/src/components/map/VoronoiLayer.tsx` (新規作成)

```typescript
import { useMemo } from 'react'
import { Delaunay } from 'd3-delaunay'
import type { MomochariPort } from '@/types'

interface VoronoiLayerProps {
  ports: MomochariPort[]
  projection: any
  viewBox: { x: number; y: number; width: number; height: number }
  currentMode: string
}

export default function VoronoiLayer({
  ports,
  projection,
  viewBox,
  currentMode
}: VoronoiLayerProps) {

  const voronoiCells = useMemo(() => {
    if (!projection || ports.length === 0) return []

    // 座標変換
    const points = ports.map(port => {
      const point = projection.projectPoint(port.lat, port.lon)
      return point ? { ...port, x: point.x, y: point.y } : null
    }).filter(Boolean)

    if (points.length < 3) return []

    // Delaunay三角分割 → Voronoi図
    const delaunay = Delaunay.from(points, d => d.x, d => d.y)
    const voronoi = delaunay.voronoi([
      0, 0, viewBox.width, viewBox.height
    ])

    // 各セルのパスを生成
    return points.map((port, i) => ({
      port,
      path: voronoi.renderCell(i),
    }))
  }, [ports, projection, viewBox])

  return (
    <g className="voronoi-layer">
      {voronoiCells.map(({ port, path }) => (
        <path
          key={port.id}
          d={path}
          className="voronoi-cell"
          data-flood-rank={port.floodRank || 0}
          fill={getVoronoiColor(port.floodRank, currentMode)}
          fillOpacity={0.2}
          stroke="#fff"
          strokeWidth={0.5}
        />
      ))}
    </g>
  )
}

function getVoronoiColor(floodRank: number | undefined, mode: string): string {
  if (mode === 'flood-emergency') {
    if (floodRank === 0) return '#22c55e' // 安全: 緑
    if (floodRank === 1) return '#eab308' // 注意: 黄
    if (floodRank === 2) return '#f97316' // 警戒: オレンジ
    return '#ef4444' // 危険: 赤
  }
  return '#3b82f6' // デフォルト: 青
}
```

#### 4.3 MapCanvasへの統合

```tsx
import VoronoiLayer from './VoronoiLayer'

// render内
<svg>
  {activeLayers.voronoi && (
    <VoronoiLayer
      ports={momochariPorts}
      projection={projection}
      viewBox={size}
      currentMode={currentMode}
    />
  )}
</svg>
```

---

### フェーズ5: ラスタ化の検討（任意・パフォーマンス改善時）

README2の提案通り、重いGeoJSONレイヤー（特に土砂災害: 4.7MB）をラスタ化します。

#### 5.1 ラスタ生成スクリプト

**ファイル**: `scripts/generate_raster_layers.sh` (新規作成)

```bash
#!/bin/bash

# 土砂災害レイヤーをPNGにラスタ化
# viewBox範囲: x=13356.86 y=-3486.06 width=41.83 height=51.06

# 解像度計算（例: 2048px幅）
WIDTH=2048
HEIGHT=$(echo "scale=0; $WIDTH * 51.06 / 41.83" | bc)

# QGISまたはInkscapeでSVG→PNG変換
# （手動で実行、または qgis_process を使用）

echo "ラスタ生成完了"
```

#### 5.2 Containers.svgの修正案（参考）

README2に記載のテンプレートを使用：

```xml
<image id="layer-landslide"
       x="13356.86" y="-3486.06" width="41.83" height="51.06"
       xlink:href="../rasters/hazard_landslide_okayama.webp"
       class="overlay switch"
       visibility="hidden" opacity="0.6" />
```

---

## 実装の優先順位

1. **フェーズ1** (必須): ももちゃりレイヤーの追加
2. **フェーズ2** (必須): モード切替機能
3. **フェーズ3** (推奨): 災害ランク計算とCSS切替
4. **フェーズ4** (オプション): ボロノイ図
5. **フェーズ5** (パフォーマンス改善時): ラスタ化

---

## 期待される効果

### SVGMapの独自価値を実現

- **意思決定支援**: 災害時にどのポートが使えるかを視覚的に判断
- **状態遷移の可視化**: モード切替で地図の意味が変わる体験
- **空間的関係**: ボロノイ図で各ポートの影響範囲を表示

### Google Mapsとの差別化

- **経路計算なし**でも価値がある（候補の絞り込み）
- **災害シミュレーション**で複数の世界線を比較
- **静的データだけ**で動作（リアルタイムAPI不要）

---

## 次のステップ

このプランに基づき、以下の順序で実装を進めます：

1. ももちゃりAPIエンドポイントの作成
2. MapCanvasでのももちゃり描画
3. モード切替UIの実装
4. 災害ランク計算スクリプトの作成
5. CSS切替による表示制御
6. ボロノイ図の実装（時間があれば）

各フェーズの実装後、動作確認とユーザビリティテストを実施します。
