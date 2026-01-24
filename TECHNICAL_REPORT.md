# 岡山防災マップシステム 技術レポート

**作成日**: 2026年1月13日
**最終更新**: 2026年1月19日
**バージョン**: 3.1
**地図エンジン**: MapLibre GL JS 5.15.0

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [技術スタック](#2-技術スタック)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [使用ファイル一覧](#4-使用ファイル一覧)
5. [主要コンポーネント](#5-主要コンポーネント)
6. [データレイヤ詳細](#6-データレイヤ詳細)
7. [実装の詳細](#7-実装の詳細)
8. [API仕様](#8-api仕様)
9. [既知の問題](#9-既知の問題)
10. [トラブルシューティング](#10-トラブルシューティング)
11. [今後の課題](#11-今後の課題)

---

## 1. プロジェクト概要

### 1.1 システムの目的

岡山防災マップシステムは、岡山市周辺の観光情報と防災情報を統合して表示するWeb地図アプリケーションです。

**主な用途**:
- 観光客向け: 岡山城、後楽園などの観光スポット案内
- 住民向け: ももちゃり（コミュニティサイクル）ポート情報
- 防災用: 土砂災害警戒区域、河川、傾斜地の可視化

### 1.2 技術的特徴

- **MapLibre GL JS**: オープンソース地図エンジンによるベクトルタイル描画
- **国土地理院データ**: 公的機関の高品質なベクトルタイル・標高データを活用
- **レイヤー重ね合わせ**: 6種類のレイヤーを自由にON/OFF切替可能
- **インタラクティブ**: クリックでポップアップ、Google Mapsとの連携

### 1.3 実装済み機能

- ✅ MapLibre GL JSによるベクトルタイル地図表示
- ✅ 7種類のデータレイヤー（観光・ももちゃり・傾斜・土砂災害・河川・地区境界・停電情報）
- ✅ **停電情報のリアルタイム表示**（中国電力スクレイピング）
- ✅ **ズームレベル別の2段階表示**（市区町村 < 11、地区 >= 11）
- ✅ **地区境界の遅延ロード**（メモリ効率化）
- ✅ クリックインタラクション（ポップアップ表示）
- ✅ 詳細情報パネル（座標、Wikipedia/公式サイトへのリンク）
- ✅ 近くのももちゃりポート表示（距離計算・上位5件）
- ✅ レスポンシブUI（サイドバー開閉、パネル追随）
- ✅ データソースattribution表示
- ✅ 現在地取得機能（GPS連動）

---

## 2. 技術スタック

### 2.1 フロントエンド

| 技術 | バージョン | 用途 | 備考 |
|------|-----------|------|------|
| **Next.js** | 14.2.33 | App Router、SSR、API Routes | React フレームワーク |
| **React** | 18.3.0 | UI構築 | フック中心の設計 |
| **TypeScript** | 5.x | 型安全性 | 厳格な型チェック |
| **Tailwind CSS** | 3.4.0 | スタイリング | ユーティリティファースト |
| **MapLibre GL JS** | 5.15.0 | 地図描画エンジン | WebGL ベース |
| **react-map-gl** | 8.1.0 | Reactラッパー | MapLibre GLのReact統合 |
| **cheerio** | 1.0.0-rc.12 | HTMLパーシング | サーバーサイドスクレイピング |

### 2.2 データソース

| データ | 提供元 | 形式 | 用途 |
|-------|--------|------|------|
| **ベクトルタイル** | [国土地理院](https://github.com/gsi-cyberjapan/gsivectortile-mapbox-gl-js) | Vector Tiles | ベースマップ（淡色） |
| **標高タイル** | [国土地理院](https://maps.gsi.go.jp/development/ichiran.html) | DEM PNG | 傾斜計算の元データ |
| **土砂災害区域** | [国土数値情報](https://nlftp.mlit.go.jp/) | GeoJSON | 土砂災害警戒区域 |
| **河川データ** | [国土数値情報](https://nlftp.mlit.go.jp/) | GeoJSON | 主要河川 |
| **地区境界** | [国土数値情報](https://nlftp.mlit.go.jp/) | GeoJSON | 岡山市・倉敷市等の地区境界 |
| **ももちゃり** | [岡山市オープンデータ](https://www.city.okayama.jp/kurashi/0000005428.html) | JSON | ポート位置・情報 |
| **観光スポット** | 手動作成 | GeoJSON | 岡山城、後楽園など |
| **停電情報** | [中国電力ネットワーク](https://www.teideninfo.energia.co.jp/) | HTMLスクレイピング | リアルタイム停電状況 |

### 2.3 開発・ビルドツール

- **Node.js**: 18以上
- **npm**: パッケージ管理
- **ESLint**: コード品質チェック
- **GDAL**: 地理空間データ変換（傾斜レイヤ生成用）

---

## 3. アーキテクチャ

### 3.1 システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                      ブラウザ（クライアント）                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Next.js App (localhost:3000)                        │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  /map (page.tsx)                               │  │  │
│  │  │  ├─ LayerPanel (レイヤー切替)                    │  │  │
│  │  │  └─ MapLibreMap (地図本体) ★                    │  │  │
│  │  │     ├─ Source & Layer (GeoJSON/Image)          │  │  │
│  │  │     ├─ InfoPanel (ポップアップ)                  │  │  │
│  │  │     └─ NearbyPortsPanel (近くのポート)           │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓ fetch                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /api/momochari  (API Routes)                        │  │
│  │  /api/shelters                                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      データソース                              │
│  - 国土地理院ベクトルタイル (https://...)                       │
│  - frontend/public/*.geojson                                 │
│  - frontend/public/momochari_with_rank.json                  │
│  - map/layers/slope_okayama_3857.png                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 ディレクトリ構成

```
/home/ubuntu/SVG2/
├── README.md                          # プロジェクト概要
├── TECHNICAL_REPORT.md                # このファイル
│
├── frontend/                          # Next.js アプリケーション
│   ├── src/
│   │   ├── app/
│   │   │   ├── map/
│   │   │   │   └── page.tsx           # ★メインマップページ
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── api/                   # API Routes
│   │   │       ├── momochari/route.ts
│   │   │       ├── shelters/route.ts
│   │   │       ├── nowc/route.ts
│   │   │       ├── route/route.ts
│   │   │       └── outages/           # ★停電情報API
│   │   │           ├── route.ts       # メインAPI（データ集約）
│   │   │           └── scrape/route.ts # スクレイピング処理
│   │   │
│   │   ├── components/
│   │   │   ├── map/
│   │   │   │   ├── MapLibreMap.tsx    # ★地図メインコンポーネント (420行)
│   │   │   │   ├── LayerPanel.tsx     # レイヤー切替パネル
│   │   │   │   ├── InfoPanel.tsx      # 情報パネル（参考用）
│   │   │   │   ├── NearbyPortsPanel.tsx  # 近くのポート表示
│   │   │   │   ├── MapCanvas.tsx
│   │   │   │   ├── ModeSelector.tsx
│   │   │   │   └── CreditBadge.tsx
│   │   │   ├── AppHeader.tsx
│   │   │   ├── Layout.tsx
│   │   │   └── ZoomGuard.tsx
│   │   │
│   │   ├── hooks/                     # カスタムフック
│   │   │   └── useDistrictLayers.ts   # ★地区境界の遅延ロード
│   │   │
│   │   ├── lib/                       # ユーティリティ
│   │   │   ├── config.ts
│   │   │   ├── layers.ts
│   │   │   ├── layerProfiles.ts
│   │   │   ├── modes.ts
│   │   │   ├── shelterLoader.ts
│   │   │   ├── tauriBridge.ts
│   │   │   └── outageMapper.ts        # ★停電情報マッピング
│   │   │
│   │   └── types/
│   │       └── index.ts
│   │
│   ├── public/                        # 静的ファイル（重要）
│   │   ├── okayama_spots.geojson      # 観光スポット（8箇所）
│   │   ├── okayama_landslide.geojson  # 土砂災害警戒区域
│   │   ├── okayama_rivers.geojson     # 河川
│   │   ├── okayama_shelters.geojson   # 避難所
│   │   ├── okayama_hospitals.geojson  # 病院
│   │   ├── okayama_fire_stations.geojson  # 消防署
│   │   ├── okayama_schools.geojson    # 学校
│   │   ├── okayama_municipalities_simple.geojson  # ★市区町村境界
│   │   ├── okayama_district_dict.json # ★地区辞書（名前→key_code）
│   │   ├── okayama_n03_dict.json      # ★市区町村辞書
│   │   ├── momochari_with_rank.json   # ももちゃりポート（メイン）
│   │   ├── momochari_with_rank_demo.json
│   │   ├── districts/                 # ★地区境界（遅延ロード）
│   │   │   ├── districts_metadata.json  # メタデータ
│   │   │   ├── okayama_districts_okayama_city_high.geojson
│   │   │   ├── okayama_districts_okayama_city_low.geojson
│   │   │   ├── okayama_districts_kurashiki_high.geojson
│   │   │   └── （他市町村の地区GeoJSON）
│   │   └── data/
│   │       └── momochari_ports.json
│   │
│   ├── package.json                   # 依存関係
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── next.config.js
│
├── map/                               # GISデータ処理
│   ├── layers/
│   │   ├── slope_okayama_3857.png     # ★傾斜画像（58MB）
│   │   ├── slope_okayama_3857_old.png
│   │   ├── slope_okayama_3857_original.png
│   │   └── slope_okayama.png          # 元画像
│   │
│   ├── data/                          # 元データ
│   │   ├── shelters_okayama.csv
│   │   └── weather_points.csv
│   │
│   └── tools/                         # データ生成スクリプト
│
└── docs/                              # ドキュメント（任意）
```

---

## 4. 使用ファイル一覧

### 4.1 重要なソースコード

| ファイルパス | 行数 | 役割 | 重要度 |
|------------|-----|------|--------|
| `frontend/src/app/map/page.tsx` | 105 | メインマップページ、状態管理 | ★★★ |
| `frontend/src/components/map/MapLibreMap.tsx` | 420 | 地図コンポーネント本体 | ★★★★★ |
| `frontend/src/components/map/LayerPanel.tsx` | - | レイヤー切替UI | ★★ |
| `frontend/src/components/map/NearbyPortsPanel.tsx` | 145 | 近くのポート表示 | ★★★ |
| `frontend/src/components/map/InfoPanel.tsx` | - | 情報パネル（参考） | ★ |

### 4.2 データファイル

| ファイルパス | サイズ | 形式 | 内容 | 必須 |
|------------|--------|------|------|------|
| `frontend/public/okayama_spots.geojson` | 小 | GeoJSON | 観光スポット8箇所 | ✅ |
| `frontend/public/momochari_with_rank.json` | 中 | JSON | ももちゃりポート情報 | ✅ |
| `map/layers/slope_okayama_3857.png` | 58MB | PNG | 傾斜画像（EPSG:3857） | ✅ |
| `frontend/public/okayama_landslide.geojson` | 大 | GeoJSON | 土砂災害警戒区域 | ✅ |
| `frontend/public/okayama_rivers.geojson` | 中 | GeoJSON | 河川データ | ✅ |
| `frontend/public/okayama_shelters.geojson` | 中 | GeoJSON | 避難所（未使用） | ⏳ |
| `frontend/public/okayama_hospitals.geojson` | 小 | GeoJSON | 病院（未使用） | ⏳ |

### 4.3 設定ファイル

- `frontend/package.json`: 依存パッケージ定義
- `frontend/tsconfig.json`: TypeScript設定
- `frontend/tailwind.config.ts`: Tailwind CSS設定
- `frontend/next.config.js`: Next.js設定

---

## 5. 主要コンポーネント

### 5.1 MapLibreMap.tsx（★最重要）

**ファイルパス**: `/home/ubuntu/SVG2/frontend/src/components/map/MapLibreMap.tsx`
**行数**: 約420行
**役割**: 地図の中核を担うコンポーネント

#### 責務

1. **地図の初期化と表示**
   - MapLibre GL JSのMapコンポーネントをラップ
   - viewport管理（中心座標・ズームレベル）
   - ズーム制限（最小8、最大17.5）

2. **レイヤー管理**
   - 6種類のレイヤーのSource/Layer定義
   - activeLayers propsに基づく表示制御
   - attribution情報の設定

3. **インタラクション処理**
   - クリックイベントハンドリング
   - マウスホバーでカーソル変更
   - ポップアップ情報の状態管理

4. **データフェッチ**
   - ももちゃりJSONの取得とGeoJSON変換
   - 現在地取得（GeolocateControl）

5. **UI表示**
   - 情報パネル（InfoPanel風）
   - 近くのポートパネル（NearbyPortsPanel）
   - レスポンシブ配置（サイドバー連動）

#### 主要なstate

```typescript
const [viewport, setViewport] = useState({
  longitude: 133.93,
  latitude: 34.66,
  zoom: 11,
})
const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null)
const [momochariGeoJSON, setMomochariGeoJSON] = useState<any>(null)
const [gpsPosition, setGpsPosition] = useState<[number, number] | null>(null)
const [momochariBikes, setMomochariBikes] = useState<any[]>([])
```

#### 主要なイベントハンドラ

- `handleMapClick(e)`: 地図クリック時、スポット/ポートの詳細表示
- `handleMouseMove(e)`: マウス移動時、カーソル変更
- `handlePortClick(bike)`: 近くのポートクリック時、地図移動とポップアップ

#### レイヤー定義の構造

```tsx
{/* 傾斜レイヤー */}
{activeLayers.slope && (
  <Source
    id="slope-source"
    type="image"
    url="/map/layers/slope_okayama_3857.png"
    coordinates={[...]}
    attribution='...'
  >
    <Layer id="slope-layer" type="raster" paint={{...}} />
  </Source>
)}

{/* 観光スポットレイヤー */}
{activeLayers.spots && (
  <Source
    id="spots-source"
    type="geojson"
    data="/okayama_spots.geojson"
    attribution='...'
  >
    <Layer id="spots-layer" type="circle" paint={{...}} />
  </Source>
)}
```

### 5.2 page.tsx（マップページ）

**ファイルパス**: `/home/ubuntu/SVG2/frontend/src/app/map/page.tsx`
**行数**: 105行
**役割**: マップページの親コンポーネント

#### 責務

1. レイヤー状態の管理（`activeLayers`）
2. サイドバー開閉状態の管理（`showSettings`）
3. LayerPanelとMapLibreMapの配置

#### コード構造

```typescript
export default function MapPage() {
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(defaultLayers)
  const [showSettings, setShowSettings] = useState(true)

  const handleLayerToggle = (layerId: string) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }))
  }

  return (
    <div className="h-screen flex relative">
      {showSettings && (
        <aside>
          <LayerPanel layers={activeLayers} onToggle={handleLayerToggle} />
        </aside>
      )}
      <MapLibreMap activeLayers={activeLayers} showSidebar={showSettings} />
    </div>
  )
}
```

### 5.3 NearbyPortsPanel.tsx

**ファイルパス**: `/home/ubuntu/SVG2/frontend/src/components/map/NearbyPortsPanel.tsx`
**行数**: 145行
**役割**: 現在地から近いももちゃりポートを表示

#### 主要機能

1. **Haversine距離計算**
   ```typescript
   const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
     const R = 6371e3
     // ... 計算
     return R * c
   }
   ```

2. **近くのポート抽出**
   - 全ポートとの距離を計算
   - 距離順にソート
   - 上位5件を表示

3. **Google Maps連携**
   - 経路ボタンクリックでGoogle Mapsを開く
   - 自転車モードで経路表示

---

## 6. データレイヤ詳細

### 6.1 レイヤー一覧

| ID | 名称 | タイプ | データソース | 表示色 | デフォルト |
|----|------|--------|------------|--------|----------|
| `basemap` | ベースマップ | vector | 国土地理院ベクトルタイル | 淡色 | ✅ ON |
| `spots` | 観光スポット | circle | okayama_spots.geojson | 赤 | ✅ ON |
| `momochari` | ももちゃり | circle | momochari_with_rank.json | 緑 | ⬜ OFF |
| `slope` | 傾斜 | raster | slope_okayama_3857.png | グレー | ⬜ OFF |
| `landslide` | 土砂災害 | fill | okayama_landslide.geojson | オレンジ | ⬜ OFF |
| `rivers` | 河川 | line | okayama_rivers.geojson | 青 | ⬜ OFF |
| `districts` | **地区境界** | line | 遅延ロード（districts/） | 水色 | ⬜ OFF |
| `outages` | **停電情報** | fill | API（スクレイピング） | 赤 | ⬜ OFF |

### 6.2 basemap（ベースマップ）

- **タイプ**: Vector Tiles
- **URL**: `https://gsi-cyberjapan.github.io/gsivectortile-mapbox-gl-js/pale.json`
- **提供**: 国土地理院
- **スタイル**: 淡色地図
- **ズームレベル**: 0-16（GSI仕様）
- **座標系**: EPSG:3857

### 6.3 spots（観光スポット）

**データファイル**: `frontend/public/okayama_spots.geojson`

#### データ構造

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name": "岡山城",
        "description": "別名「烏城」。黒い外観が特徴的な城郭。",
        "url": "https://ja.wikipedia.org/wiki/%E5%B2%A1%E5%B1%B1%E5%9F%8E",
        "type": "castle"
      },
      "geometry": {
        "type": "Point",
        "coordinates": [133.9354, 34.6655]
      }
    }
  ]
}
```

#### 登録スポット（8箇所）

1. 岡山城（castle）
2. 岡山後楽園（garden）
3. 倉敷美観地区（tourist）
4. 吉備津神社（shrine）
5. 吉備津彦神社（shrine）
6. 鷲羽山（tourist）
7. 瀬戸大橋（bridge）
8. （もう1箇所）

#### MapLibreMap.tsxでの実装

```typescript
{activeLayers.spots && (
  <Source
    id="spots-source"
    type="geojson"
    data="/okayama_spots.geojson"
    attribution='観光スポットデータ'
  >
    <Layer
      id="spots-layer"
      type="circle"
      paint={{
        'circle-radius': 8,
        'circle-color': '#ef4444',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      }}
    />
  </Source>
)}
```

### 6.4 momochari（ももちゃりポート）

**データファイル**: `frontend/public/momochari_with_rank.json`

#### データ構造

```json
[
  {
    "id": "岡山駅東口ポート",
    "lat": 34.6619,
    "lon": 133.9195,
    "address": "岡山市北区駅元町1-1",
    "floodRank": 3,
    "status": "稼働中"
  }
]
```

#### 特徴

- 岡山市内の複数ポート情報
- `floodRank`: 洪水リスクランク（1-5）
- `address`: HTMLタグ（`<br>`）が含まれる場合あり → 正規表現で除去

#### MapLibreMap.tsxでの実装

```typescript
// データフェッチとGeoJSON変換
useEffect(() => {
  if (!activeLayers.momochari) return

  fetch('/momochari_with_rank.json')
    .then(res => res.json())
    .then(data => {
      const geojson = {
        type: 'FeatureCollection',
        features: data.map((port: any) => ({
          type: 'Feature',
          properties: {
            id: port.id,
            address: port.address,
            floodRank: port.floodRank,
          },
          geometry: {
            type: 'Point',
            coordinates: [port.lon, port.lat],
          },
        })),
      }
      setMomochariGeoJSON(geojson)
      setMomochariBikes(data.map((port: any) => ({
        id: port.id,
        lat: port.lat,
        lon: port.lon,
        status: port.status,
      })))
    })
}, [activeLayers.momochari])

// レイヤー描画
{activeLayers.momochari && momochariGeoJSON && (
  <Source
    id="momochari-source"
    type="geojson"
    data={momochariGeoJSON}
    attribution='岡山市オープンデータ'
  >
    <Layer
      id="momochari-layer"
      type="circle"
      paint={{
        'circle-radius': 6,
        'circle-color': '#22c55e',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      }}
    />
  </Source>
)}
```

### 6.5 slope（傾斜レイヤ）

**データファイル**: `map/layers/slope_okayama_3857.png`

#### 仕様

- **ファイルサイズ**: 58MB（最適化済み）
- **解像度**: 4881 x 7238 pixels
- **投影法**: EPSG:3857 (Web Mercator)
- **範囲**: 岡山市周辺
- **座標**:
  - Top-Left: `[133.56860, 34.86095]`
  - Top-Right: `[133.98691, 34.86095]`
  - Bottom-Right: `[133.98691, 34.35036]`
  - Bottom-Left: `[133.56860, 34.35036]`
- **位置調整**: 元座標から0.00035度（約38m）北にシフト

#### 生成方法

```bash
# 元画像（国土地理院標高タイルから生成）
gdal_translate -of PNG -outsize 50% 50% slope_okayama.png slope_okayama_3857_optimized.png
gdalwarp -t_srs EPSG:3857 -ts 4881 7238 -r bilinear slope_okayama.png slope_okayama_3857.png
```

#### MapLibreMap.tsxでの実装

```typescript
{activeLayers.slope && (
  <Source
    id="slope-source"
    type="image"
    url="/map/layers/slope_okayama_3857.png"
    coordinates={[
      [133.56860, 34.86095], // top-left (北に0.00035度シフト)
      [133.98691, 34.86095], // top-right
      [133.98691, 34.35036], // bottom-right
      [133.56860, 34.35036], // bottom-left
    ]}
    attribution='国土地理院標高タイル'
  >
    <Layer
      id="slope-layer"
      type="raster"
      paint={{
        'raster-opacity': 0.6,
      }}
    />
  </Source>
)}
```

### 6.6 landslide（土砂災害警戒区域）

**データファイル**: `frontend/public/okayama_landslide.geojson`

#### 仕様

- **タイプ**: Polygon（面データ）
- **出典**: 国土数値情報
- **内容**: 岡山県内の土砂災害警戒区域

#### MapLibreMap.tsxでの実装

```typescript
{activeLayers.landslide && (
  <Source
    id="landslide-source"
    type="geojson"
    data="/okayama_landslide.geojson"
    attribution='国土数値情報'
  >
    <Layer
      id="landslide-layer"
      type="fill"
      paint={{
        'fill-color': '#f97316',
        'fill-opacity': 0.4,
      }}
    />
    <Layer
      id="landslide-outline"
      type="line"
      paint={{
        'line-color': '#c2410c',
        'line-width': 1,
      }}
    />
  </Source>
)}
```

### 6.7 rivers（河川）

**データファイル**: `frontend/public/okayama_rivers.geojson`

#### 仕様

- **タイプ**: LineString（線データ）
- **出典**: 国土数値情報
- **内容**: 岡山県内の主要河川

#### MapLibreMap.tsxでの実装

```typescript
{activeLayers.rivers && (
  <Source
    id="rivers-source"
    type="geojson"
    data="/okayama_rivers.geojson"
    attribution='国土数値情報'
  >
    <Layer
      id="rivers-layer"
      type="line"
      paint={{
        'line-color': '#3b82f6',
        'line-width': 2,
        'line-opacity': 0.7,
      }}
    />
  </Source>
)}
```

### 6.8 districts（地区境界）★NEW

**データファイル**: `frontend/public/districts/*.geojson`

#### 仕様

- **タイプ**: Polygon（面データ）
- **出典**: 国土数値情報（小地域境界データ）
- **内容**: 岡山市・倉敷市等の町丁目レベルの境界
- **表示条件**: ズームレベル11以上
- **ロード方式**: **遅延ロード**（useDistrictLayers フック）

#### 遅延ロードの仕組み

地区境界データは数十MB~数百MBと大きいため、全データを最初から読み込むとメモリとネットワーク帯域を圧迫します。このため、以下の工夫を実装：

1. **メタデータ駆動**: `districts_metadata.json` でエリアごとのファイル情報を管理
2. **ズームレベル別ファイル**: 高ズーム（zoom >= 13）と低ズーム（11 <= zoom < 13）で分離
3. **エリア別分割**: 岡山市、倉敷市など市町村単位で分割
4. **動的ロード**: 現在のビューポートと必要なエリアのみを動的に取得

#### メタデータ構造（districts_metadata.json）

```json
{
  "areas": {
    "okayama_city": {
      "name": "岡山市",
      "high_zoom": {
        "file": "okayama_districts_okayama_city_high.geojson",
        "min_zoom": 13,
        "features": 805
      },
      "low_zoom": {
        "file": "okayama_districts_okayama_city_low.geojson",
        "min_zoom": 11,
        "max_zoom": 12,
        "features": 805
      }
    },
    "kurashiki": {
      "name": "倉敷市",
      "high_zoom": {
        "file": "okayama_districts_kurashiki_high.geojson",
        "min_zoom": 13,
        "features": 650
      },
      "low_zoom": {
        "file": "okayama_districts_kurashiki_low.geojson",
        "min_zoom": 11,
        "max_zoom": 12,
        "features": 650
      }
    }
  }
}
```

#### useDistrictLayers.tsの実装

**ファイルパス**: `/home/ubuntu/SVG2/frontend/src/hooks/useDistrictLayers.ts`

```typescript
export function useDistrictLayers(currentZoom: number, enabled: boolean) {
  const [metadata, setMetadata] = useState<DistrictMetadata | null>(null)
  const [loadedLayers, setLoadedLayers] = useState<Map<string, LoadedLayer>>(new Map())
  const [loading, setLoading] = useState(false)

  // メタデータの読み込み（初回のみ）
  useEffect(() => {
    if (!enabled) return
    fetch('/districts/districts_metadata.json')
      .then(res => res.json())
      .then(data => setMetadata(data))
  }, [enabled])

  // 現在のズームレベルに必要なレイヤーを判定
  const getRequiredLayers = useCallback(() => {
    if (!metadata || currentZoom < 11) return []

    const required: Array<{ areaId: string; zoomLevel: 'high' | 'low'; file: string }> = []
    for (const [areaId, area] of Object.entries(metadata.areas)) {
      if (currentZoom >= area.high_zoom.min_zoom) {
        required.push({ areaId, zoomLevel: 'high', file: area.high_zoom.file })
      } else if (currentZoom >= area.low_zoom.min_zoom && currentZoom <= area.low_zoom.max_zoom) {
        required.push({ areaId, zoomLevel: 'low', file: area.low_zoom.file })
      }
    }
    return required
  }, [metadata, currentZoom])

  // レイヤーの動的ロード
  useEffect(() => {
    if (!enabled || !metadata) return
    const required = getRequiredLayers()
    if (required.length === 0) {
      setLoadedLayers(new Map())
      return
    }
    // 各レイヤーをfetchして loadedLayers に追加
    // 不要になったレイヤーは削除（メモリ節約）
  }, [enabled, metadata, currentZoom])

  // 現在表示すべきGeoJSONを結合して返す
  const getCombinedGeoJSON = useCallback(() => {
    // loadedLayers から全featuresを結合
    return { type: 'FeatureCollection', features: allFeatures }
  }, [loadedLayers])

  return {
    geojson: getCombinedGeoJSON(),
    loading,
    error,
    featureCount: getCombinedGeoJSON()?.features.length || 0
  }
}
```

#### MapLibreMap.tsxでの実装

```typescript
// ズームレベル11以上で地区境界をロード
const {
  geojson: districtsGeoJSON,
  loading: districtsLoading,
  error: districtsError,
  featureCount
} = useDistrictLayers(
  viewport.zoom,
  activeLayers.districts || activeLayers.outages
)

// レイヤー描画（ズーム11以上のみ）
{activeLayers.districts && districtsGeoJSON && viewport.zoom >= 11 && (
  <Source
    id="districts-source"
    type="geojson"
    data={districtsGeoJSON}
    attribution='国土数値情報'
  >
    <Layer
      id="districts-layer"
      type="line"
      paint={{
        'line-color': '#60a5fa',
        'line-width': 1,
        'line-opacity': 0.8,
      }}
    />
  </Source>
)}
```

#### メモリ効率化の効果

- **従来**: 全地区データを一度に読み込み → 数百MB、初回ロード数十秒
- **遅延ロード**: 必要なエリアとズームレベルのみ → 数MB～数十MB、数秒
- **動的削除**: ビューポート外に出たエリアのデータを自動削除

### 6.9 outages（停電情報）★NEW

**データソース**: 中国電力ネットワーク株式会社 停電情報サイト
**URL**: https://www.teideninfo.energia.co.jp/

#### 仕様

- **タイプ**: Polygon（面データ） + fill レイヤー
- **更新頻度**: リアルタイム（APIポーリング間隔: 30秒～1分）
- **表示形式**: ズームレベル別2段階表示
  - **ズーム < 11**: 市区町村レベル（岡山市北区、倉敷市など）
  - **ズーム >= 11**: 地区レベル（大井、掛畑、上高田など）
- **データ取得**: スクレイピング（cheerio）
- **対象地域**: 岡山県のみ

#### データ構造

```typescript
interface OutageInfo {
  prefecture: string          // 都道府県（「岡山県」）
  city: string                // 市（「岡山市」「倉敷市」など）
  ward?: string               // 区（「北区」「中区」など）※岡山市・倉敷市のみ
  district?: string           // 地区名（「大井」など）または複数地区「大井, 掛畑, 上高田」
  households: number          // 停電戸数
  timestamp: string           // 発生日時（ISO 8601）
  cause: string               // 原因（「設備故障」「当社設備への倒木」など）
  status: 'ongoing' | 'recovered'  // 状態
  recovered_at?: string       // 復旧日時（ISO 8601）
  estimated_recovery?: string // 復旧見込み時刻（ISO 8601）
}
```

#### APIエンドポイント

**GET /api/outages**

停電情報を取得（時間範囲指定可能）

**クエリパラメータ**:
- `timeRange`: 時間範囲（`current` | `1h` | `24h` | `7d`）デフォルト: `current`
- `demo`: デモモード（`true` | `false`）デフォルト: `false`

**レスポンス**:
```json
[
  {
    "prefecture": "岡山県",
    "city": "岡山市",
    "ward": "北区",
    "district": "大井, 掛畑, 上高田",
    "households": 0,
    "timestamp": "2026-01-18T08:26:34.936Z",
    "cause": "当社設備への倒木",
    "status": "recovered",
    "recovered_at": "2026-01-18T10:15:00.000Z"
  }
]
```

**GET /api/outages/scrape**

中国電力サイトから直接スクレイピング（内部API）

**クエリパラメータ**:
- `date`: 日付（YYYYMMDD形式）デフォルト: 今日
- `type`: 停電種別（空文字 = 5分以上、`other` = 5分未満）

**実装ファイル**: `/home/ubuntu/SVG2/frontend/src/app/api/outages/scrape/route.ts`

#### スクレイピング実装

**技術**: cheerio（サーバーサイドHTMLパーシング）

```typescript
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const url = `https://www.teideninfo.energia.co.jp/LWC30040/index?date=${date}&type=`

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0...' }
  })
  const html = await response.text()
  const $ = cheerio.load(html)

  // HTML構造:
  // - li.js-tdk (県レベル) data-tdk="岡山県"
  //   - li.js-scg (市区町村レベル) data-scg="岡山市　北区"
  //     - ul.js-knm (停電リスト)
  //       - li (各停電情報)
  //         - div[0]: timestamp (発生日時)
  //         - div[1]: recovered_at (復旧日時)
  //         - div[2]: cause (原因)
  //         - div[3]: households (停電戸数)
  //         - span.js-jsy: data-jsy="地区名"（複数可）

  $('.js-tdk').each((_, prefElement) => {
    const prefecture = $(prefElement).attr('data-tdk')
    if (prefecture !== '岡山県') return

    $(prefElement).find('.js-scg').each((_, cityElement) => {
      const cityFull = $(cityElement).attr('data-scg') || ''

      // 市区町村名の分割処理
      // 例: "岡山市　北区" → city="岡山市", ward="北区"
      // 例: "苫田郡　鏡野町" → city="苫田郡", ward="鏡野町"
      let city = cityFull.trim()
      let ward = ''
      const spaceMatch = cityFull.match(/^(.+?)[\s　]+(.+)$/)
      if (spaceMatch) {
        city = spaceMatch[1].trim()
        ward = spaceMatch[2].trim()
      }

      // 地区名の取得（span.js-jsy）
      const districts: string[] = []
      $(outageItem).find('.js-jsy').each((_, districtSpan) => {
        const districtName = $(districtSpan).attr('data-jsy')
        if (districtName && districtName.trim()) {
          districts.push(districtName.trim())
        }
      })
      const districtName = districts.length > 0 ? districts.join(', ') : ''

      outages.push({
        prefecture: '岡山県',
        city,
        ward: ward || undefined,
        district: districtName,
        households: parseInt(householdsText.replace(/[^0-9]/g, '')) || 0,
        timestamp: parseJapaneseDate(timestampDiv),
        cause,
        status: recoveredAtDiv && recoveredAtDiv !== '-' ? 'recovered' : 'ongoing',
        recovered_at: recoveredAtDiv && recoveredAtDiv !== '-' ? parseJapaneseDate(recoveredAtDiv) : undefined
      })
    })
  })

  return NextResponse.json({
    success: true,
    total: outages.length,
    current: outages.filter(o => o.status === 'ongoing').length,
    data: outages.filter(o => o.status === 'ongoing'), // 現在停電中のみ
    all: outages // デバッグ用
  })
}
```

#### 市区町村レベル表示（ズーム < 11）

**GeoJSON**: `okayama_municipalities_simple.geojson`（市区町村境界）
**辞書**: `okayama_n03_dict.json`（市区町村名の正規化用）

**マッチングロジック**:
1. 停電情報から `city` + `ward` を結合 → "岡山市北区"
2. 県名を追加 → "岡山県 岡山市北区"
3. GeoJSONのfeature.properties.nameと照合
4. 一致したfeatureの `outage: true` プロパティを設定

**特殊処理**:
- 「苫田郡 鏡野町」のような郡+町村の場合は町村名のみ使用 → "岡山県 鏡野町"

```typescript
const municipalityOutageGeoJSON = useMemo(() => {
  if (!municipalitiesGeoJSON || outageData.length === 0) return municipalitiesGeoJSON

  const outageCities = new Set<string>()
  for (const outage of outageData) {
    let cityPart: string
    // 郡+町/村 の場合は町村名のみ
    if (outage.city && outage.city.includes('郡') && outage.ward && (outage.ward.includes('町') || outage.ward.includes('村'))) {
      cityPart = outage.ward
    } else if (outage.ward) {
      cityPart = `${outage.city}${outage.ward}`
    } else {
      cityPart = outage.city || ''
    }
    const cityName = `${outage.prefecture || ''} ${cityPart}`.trim()
    outageCities.add(cityName)
  }

  return {
    type: 'FeatureCollection',
    features: municipalitiesGeoJSON.features.map((feature: any) => ({
      ...feature,
      properties: {
        ...feature.properties,
        outage: outageCities.has(feature.properties.name.trim())
      }
    }))
  }
}, [municipalitiesGeoJSON, outageData])
```

#### 地区レベル表示（ズーム >= 11）

**GeoJSON**: `districts/*.geojson`（地区境界、遅延ロード）
**辞書**: `okayama_district_dict.json`（地区名 → key_code マッピング）

**辞書構造**:
```json
{
  "岡山県|岡山市|北区|大井": {
    "key_code": "33101001001",
    "prefecture": "岡山県",
    "city": "岡山市",
    "ward": "北区",
    "district": "大井"
  }
}
```

**マッチングロジック**:
1. 停電情報の `district` フィールドをカンマで分割 → `["大井", "掛畑", "上高田"]`
2. 各地区名について正規化キーを生成 → "岡山県|岡山市|北区|大井"
3. 辞書から `key_code` を取得
4. GeoJSONのfeature.properties.key_codeと照合
5. 一致したfeatureの `outage: true` プロパティを設定

**buildNormalizedKey 関数**（outageMapper.ts）:
```typescript
export function buildNormalizedKey(outage: OutageInfo): string {
  const normalize = (str: string) => str.replace(/\s+/g, '').replace(/[０-９]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
  )

  const parts = [
    normalize(outage.prefecture || ''),
    normalize(outage.city || ''),
    outage.ward ? normalize(outage.ward) : '',
    outage.district ? normalize(outage.district) : ''
  ].filter(Boolean)

  return parts.join('|')
}
```

```typescript
const districtOutageGeoJSON = useMemo(() => {
  if (!districtsGeoJSON || !districtDict || outageData.length === 0) return districtsGeoJSON

  const outageKeys = new Set<string>()
  for (const outage of outageData) {
    if (!outage.district || outage.district.trim() === '') continue

    // カンマ区切りで複数地区を分割
    const districts = outage.district.split(',').map(d => d.trim()).filter(d => d)
    for (const district of districts) {
      const districtOutage = { ...outage, district: district }
      const normalizedKey = buildNormalizedKey(districtOutage)
      const districtEntry = districtDict[normalizedKey]
      if (districtEntry) {
        outageKeys.add(districtEntry.key_code)
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: districtsGeoJSON.features.map((feature: any) => ({
      ...feature,
      properties: {
        ...feature.properties,
        outage: outageKeys.has(feature.properties.key_code)
      }
    }))
  }
}, [districtsGeoJSON, districtDict, outageData])
```

#### MapLibreMap.tsxでの実装

```typescript
// 市区町村レベル（ズーム < 11）
{activeLayers.outages && municipalityOutageGeoJSON && viewport.zoom < 11 && outageData.length > 0 && (
  <Source id="outages-municipality-source" type="geojson" data={municipalityOutageGeoJSON}>
    <Layer
      id="outages-municipality-fill"
      type="fill"
      paint={{
        'fill-color': ['case', ['get', 'outage'], '#ef4444', 'transparent'],
        'fill-opacity': 0.5,
      }}
    />
    <Layer
      id="outages-municipality-outline"
      type="line"
      paint={{
        'line-color': ['case', ['get', 'outage'], '#b91c1c', 'transparent'],
        'line-width': 2,
      }}
    />
  </Source>
)}

// 地区レベル（ズーム >= 11）
{activeLayers.outages && districtOutageGeoJSON && viewport.zoom >= 11 && outageData.length > 0 && (
  <Source id="outages-district-source" type="geojson" data={districtOutageGeoJSON}>
    <Layer
      id="outages-district-fill"
      type="fill"
      paint={{
        'fill-color': ['case', ['get', 'outage'], '#ef4444', 'transparent'],
        'fill-opacity': 0.6,
      }}
    />
    <Layer
      id="outages-district-outline"
      type="line"
      paint={{
        'line-color': ['case', ['get', 'outage'], '#b91c1c', 'transparent'],
        'line-width': 2,
      }}
    />
  </Source>
)}
```

#### 定期ポーリング

```typescript
useEffect(() => {
  if (!activeLayers.outages) return

  const fetchOutages = () => {
    fetch('/api/outages?timeRange=7d')
      .then(res => res.json())
      .then(data => setOutageData(data))
      .catch(err => console.error('[Outage] Fetch error:', err))
  }

  fetchOutages() // 初回実行
  const interval = setInterval(fetchOutages, 60000) // 1分ごと

  return () => clearInterval(interval)
}, [activeLayers.outages])
```

#### 実装上の課題とデバッグ

**現在の問題**: 地区レベル表示（ズーム >= 11）で停電情報が表示されない場合がある

**デバッグログ**:
```typescript
console.log('[Outage] District useMemo called:', {
  hasDistrictsGeoJSON: !!districtsGeoJSON,
  hasDistrictDict: !!districtDict,
  outageDataLength: outageData.length,
  districtsFeatures: districtsGeoJSON?.features?.length || 0
})
```

**考えられる原因**:
1. `districtsGeoJSON` の遅延ロードが完了していない（ズーム11以上でもGeoJSONがnull）
2. 辞書マッチングの失敗（正規化キーが一致しない）
3. district フィールドが空文字の停電情報（市区町村レベルのみの情報）

---

## 7. 実装の詳細

### 7.1 クリックインタラクション

#### インタラクティブレイヤーの設定

```typescript
<Map
  interactiveLayerIds={['spots-layer', 'momochari-layer']}
  onClick={handleMapClick}
  onMouseMove={handleMouseMove}
>
```

#### クリックイベントハンドラ

```typescript
const handleMapClick = (e: any) => {
  const features = e.features
  if (!features || features.length === 0) return

  console.log('Clicked features:', features.map((f: any) => ({ id: f.layer.id, props: f.properties })))

  // 観光スポットをクリック
  const spotFeature = features.find((f: any) => f.layer.id === 'spots-layer')
  if (spotFeature) {
    const props = spotFeature.properties
    const coords = (spotFeature.geometry as any).coordinates
    setPopupInfo({
      longitude: coords[0],
      latitude: coords[1],
      name: props.name,
      description: props.description,
      url: props.url,
      type: props.type || 'tourist',
    })
    return
  }

  // ももちゃりポートをクリック
  const momochariFeature = features.find((f: any) => f.layer.id === 'momochari-layer')
  if (momochariFeature) {
    const props = momochariFeature.properties
    const coords = (momochariFeature.geometry as any).coordinates
    // <br>タグを除去または改行に変換
    const cleanName = (props.id || 'ももちゃりポート').replace(/<br\s*\/?>/gi, ' ')
    const cleanAddress = (props.address || '').replace(/<br\s*\/?>/gi, ' ')
    setPopupInfo({
      longitude: coords[0],
      latitude: coords[1],
      name: cleanName,
      description: cleanAddress,
      url: 'https://www.okayama-kuko.co.jp/momochari/',
      type: 'momochari',
    })
    return
  }
}
```

### 7.2 情報パネル（ポップアップ）

#### UI構造

```tsx
{popupInfo && (
  <aside
    className="w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden transition-all duration-300 ease-in-out"
    style={{
      position: 'absolute',
      top: '1rem',
      left: showSidebar ? '16px' : '80px',
    }}
  >
    {/* ヘッダー */}
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
      <h2>{popupInfo.name}</h2>
      <button onClick={() => setPopupInfo(null)}>×</button>
    </div>

    {/* 詳細情報 */}
    <div className="p-5 space-y-4">
      {/* 種別バッジ */}
      <span>
        {popupInfo.type === 'castle' ? '🏯 城郭' :
         popupInfo.type === 'garden' ? '🌳 庭園' :
         popupInfo.type === 'tourist' ? '🗺️ 観光地' :
         popupInfo.type === 'shrine' ? '⛩️ 神社' :
         popupInfo.type === 'bridge' ? '🌉 橋梁' :
         popupInfo.type === 'momochari' ? '🚲 ももちゃり' : '📍 スポット'}
      </span>

      {/* 説明 */}
      {popupInfo.description && (
        <p>{popupInfo.description}</p>
      )}

      {/* 座標情報 */}
      <div className="grid grid-cols-2 gap-3">
        <div>緯度: {popupInfo.latitude.toFixed(5)}</div>
        <div>経度: {popupInfo.longitude.toFixed(5)}</div>
      </div>

      {/* Google Maps で開く */}
      <a href={`https://www.google.com/maps/search/?api=1&query=${popupInfo.latitude},${popupInfo.longitude}`}>
        Googleマップで開く
      </a>

      {/* Wikipedia/公式サイト */}
      {popupInfo.url && popupInfo.url !== '#' && (
        <a href={popupInfo.url}>
          {popupInfo.type === 'momochari' ? '公式サイトで詳細を見る' : 'Wikipediaで詳細を見る'}
        </a>
      )}
    </div>
  </aside>
)}
```

### 7.3 近くのポート表示

#### 配置

```tsx
{activeLayers.momochari && momochariBikes.length > 0 && (
  <div
    style={{
      position: 'absolute',
      bottom: '1rem',
      left: showSidebar ? '16px' : '80px',
      maxWidth: '300px',
    }}
  >
    <NearbyPortsPanel
      bikes={momochariBikes}
      gpsPosition={gpsPosition}
      visitedCount={0}
      totalCount={momochariBikes.length}
      onPortClick={handlePortClick}
    />
  </div>
)}
```

#### ポートクリック時の動作

```typescript
const handlePortClick = (bike: any) => {
  // 地図を該当ポートに移動
  setViewport({
    longitude: bike.lon,
    latitude: bike.lat,
    zoom: 15,
  })
  // ポップアップを表示
  const cleanName = (bike.id || 'ももちゃりポート').replace(/<br\s*\/?>/gi, ' ')
  setPopupInfo({
    longitude: bike.lon,
    latitude: bike.lat,
    name: cleanName,
    description: bike.address || '',
    url: 'https://www.okayama-kuko.co.jp/momochari/',
    type: 'momochari',
  })
}
```

### 7.4 現在地取得（実装中）

#### GeolocateControl設定

```typescript
const geolocateControlRef = useRef<any>(null)

// useEffectでネイティブイベントリスナーを設定
useEffect(() => {
  const map = mapRef.current?.getMap()
  if (!map) return

  const onMapLoad = () => {
    const geolocateControl = geolocateControlRef.current
    if (geolocateControl) {
      const control = geolocateControl._geolocateControl || geolocateControl

      control.on('geolocate', (e: any) => {
        console.log('Geolocate event:', e)
        if (e.coords) {
          setGpsPosition([e.coords.latitude, e.coords.longitude])
        }
      })

      control.on('trackuserlocationstart', () => {
        console.log('Track user location started')
      })

      control.on('error', (e: any) => {
        console.error('Geolocation error:', e)
      })
    }
  }

  if (map.loaded()) {
    onMapLoad()
  } else {
    map.on('load', onMapLoad)
  }

  return () => {
    map.off('load', onMapLoad)
  }
}, [])

// JSX
<GeolocateControl
  ref={geolocateControlRef}
  position="top-right"
  trackUserLocation={true}
  showUserLocation={true}
/>
```

**問題**: ⚠️ 現在、イベントが発火せず現在地が取得できない（デバッグ中）

---

## 8. API仕様

### 8.1 GET /api/momochari

ももちゃりポート情報を取得

**リクエスト**: なし

**レスポンス**:
```json
[
  {
    "id": "岡山駅東口ポート",
    "lat": 34.6619,
    "lon": 133.9195,
    "address": "岡山市北区駅元町1-1",
    "floodRank": 3,
    "status": "稼働中"
  }
]
```

### 8.2 GET /api/shelters

避難所情報を取得

**実装**: `/home/ubuntu/SVG2/frontend/src/app/api/shelters/route.ts`

### 8.3 GET /api/nowc

降水ナウキャストの対象時刻を取得

**実装**: `/home/ubuntu/SVG2/frontend/src/app/api/nowc/route.ts`

### 8.4 GET /api/outages ★NEW

停電情報を取得（時間範囲指定可能）

**実装**: `/home/ubuntu/SVG2/frontend/src/app/api/outages/route.ts`

**クエリパラメータ**:
- `timeRange`: 時間範囲（`current` | `1h` | `24h` | `7d`）デフォルト: `current`
- `demo`: デモモード（`true` | `false`）デフォルト: `false`

**レスポンス**:
```json
[
  {
    "prefecture": "岡山県",
    "city": "岡山市",
    "ward": "北区",
    "district": "大井, 掛畑, 上高田",
    "households": 0,
    "timestamp": "2026-01-18T08:26:34.936Z",
    "cause": "当社設備への倒木",
    "status": "recovered",
    "recovered_at": "2026-01-18T10:15:00.000Z"
  }
]
```

**動作**:
- `demo=false`（デフォルト）: `/api/outages/scrape` を呼び出して中国電力サイトから実データをスクレイピング
- `demo=true`: テスト用モックデータを返却
- `timeRange`に応じて過去N日分のデータを取得し、フィルタリング

### 8.5 GET /api/outages/scrape ★NEW

中国電力ネットワーク停電情報サイトから直接スクレイピング（内部API）

**実装**: `/home/ubuntu/SVG2/frontend/src/app/api/outages/scrape/route.ts`

**クエリパラメータ**:
- `date`: 日付（YYYYMMDD形式）デフォルト: 今日
- `type`: 停電種別（空文字 = 5分以上、`other` = 5分未満）デフォルト: 空文字

**レスポンス**:
```json
{
  "success": true,
  "total": 12,
  "current": 0,
  "data": [
    // 現在停電中のデータのみ
  ],
  "all": [
    // 全データ（ongoing + recovered）
  ]
}
```

**技術**:
- **cheerio** でHTMLパーシング
- User-Agentヘッダーを設定してサーバーサイドからfetch
- HTML構造: `li.js-tdk` (県) → `li.js-scg` (市区町村) → `ul.js-knm` (停電リスト)
- 日本語の日時表記（例: "2026/01/19 10:30"）をISO 8601形式に変換

---

## 9. 既知の問題

### 9.1 停電情報の地区レベル表示が不安定 ⚠️

#### 現象

- ズームレベル11以上（地区レベル表示）で停電情報が表示されない場合がある
- 市区町村レベル（ズーム < 11）では正常に表示される
- ブラウザコンソールに `hasDistrictsGeoJSON: false` と表示される

#### 原因

1. **地区GeoJSONの遅延ロードタイミング**: ズーム11以上でGeoJSONロードが開始されるが、useMemoの実行タイミングとの競合状態（race condition）が発生
2. **辞書マッチングの失敗**: 一部の地区名が正規化キーで一致しない
3. **空のdistrictフィールド**: 市区町村レベルのみの停電情報（地区名なし）は地区レベルでは表示できない

#### デバッグ状況

以下のログを追加して原因調査中：

```typescript
console.log('[Outage] District useMemo called:', {
  hasDistrictsGeoJSON: !!districtsGeoJSON,
  hasDistrictDict: !!districtDict,
  outageDataLength: outageData.length,
  districtsFeatures: districtsGeoJSON?.features?.length || 0
})

console.log('[Outage Render] District layer:', {
  zoom: viewport.zoom,
  shouldShow,
  hasDistrictGeoJSON: !!districtOutageGeoJSON,
  outageDataLength: outageData.length
})
```

#### 次のステップ

1. useDistrictLayersフックのgetCombinedGeoJSONが確実に実行されることを確認
2. districtOutageGeoJSON useMemoの依存配列を確認
3. ズーム11でのGeoJSONロード完了を待機するローディング状態の追加

### 9.2 現在地取得機能（解決済み✅）

**問題**: GeolocateControlで現在地が取得できなかった

**解決策**: navigator.geolocation APIを直接使用するように実装を変更

**状態**: ✅ 解決済み

### 9.3 傾斜レイヤの位置ズレ（解決済み✅）

#### 問題

傾斜画像が実際の地形と70-80mほど南にズレていた

#### 原因

gdalinfoで取得した座標がわずかにズレていた

#### 解決策

座標を0.00035度（約38m）北にシフト

**修正前**:
```typescript
coordinates: [
  [133.56860, 34.86060], // top-left
  ...
]
```

**修正後**:
```typescript
coordinates: [
  [133.56860, 34.86095], // top-left (北に0.00035度シフト)
  ...
]
```

**状態**: ✅ 解決済み

### 9.4 傾斜レイヤの読み込みが遅い（改善済み✅）

#### 問題

193MBの画像ファイルで初回読み込みに時間がかかった

#### 解決策

GDALで50%縮小し、58MBに最適化

```bash
gdal_translate -of PNG -outsize 50% 50% slope_okayama_3857.png slope_okayama_3857_optimized.png
```

**状態**: ✅ 改善済み（193MB → 58MB、約70%削減）

### 9.5 ももちゃりのタイトルに`<br>`タグが表示される（解決済み✅）

#### 問題

JSONデータの`id`フィールドに`<br>`タグがそのまま含まれており、画面上に「ポート名<br>詳細」のように表示されていた

#### 解決策

正規表現でHTMLタグを除去

```typescript
const cleanName = (props.id || 'ももちゃりポート').replace(/<br\s*\/?>/gi, ' ')
const cleanAddress = (props.address || '').replace(/<br\s*\/?>/gi, ' ')
```

**状態**: ✅ 解決済み

---

## 10. トラブルシューティング

### 10.1 地図が表示されない

#### 確認事項

1. 開発サーバーが起動しているか
   ```bash
   cd frontend
   npm run dev
   ```

2. ブラウザでhttp://localhost:3000/mapにアクセス

3. ブラウザコンソールでエラーを確認
   - 404エラー → データファイルのパスを確認
   - CORS エラー → Next.jsの設定を確認
   - MapLibre GLのエラー → バージョン互換性を確認

### 10.2 レイヤーが表示されない

#### 確認事項

1. サイドバーでレイヤーがONになっているか

2. データファイルが存在するか
   ```bash
   ls frontend/public/okayama_*.geojson
   ls frontend/public/momochari_with_rank.json
   ls map/layers/slope_okayama_3857.png
   ```

3. ブラウザのNetworkタブで404エラーがないか

4. GeoJSONの形式が正しいか（JSON Lintで検証）

### 10.3 クリックしてもポップアップが表示されない

#### 確認事項

1. `interactiveLayerIds`が正しく設定されているか
   ```typescript
   <Map interactiveLayerIds={['spots-layer', 'momochari-layer']}>
   ```

2. レイヤーIDが一致しているか（`<Layer id="spots-layer">`）

3. ブラウザコンソールで「Clicked features:」ログが出ているか

4. `handleMapClick`が実行されているか

### 10.4 近くのポートが表示されない

#### 確認事項

1. ももちゃりレイヤーがONか

2. 現在地が取得されているか（右上のボタンをクリック）

3. ブラウザコンソールで`gpsPosition`の値を確認

4. `momochariBikes`配列にデータが入っているか

---

## 11. 今後の課題

### 11.1 緊急度: 高

- [ ] **停電情報の地区レベル表示の安定化**: 遅延ロードとuseMemoの競合状態を解決
- [ ] **パフォーマンス最適化**: 大きなGeoJSONファイルの軽量化
- [ ] **エラーハンドリング**: データ取得失敗時の適切なエラー表示

### 11.2 緊急度: 中

- [ ] **避難所レイヤーの追加**: okayama_shelters.geojsonを活用
- [ ] **洪水浸水想定区域の追加**: ハザードマップデータの統合
- [ ] **レイヤー凡例の表示**: 各レイヤーの色・記号の説明
- [ ] **モバイル最適化**: タッチ操作の改善、レスポンシブUI

### 11.3 緊急度: 低

- [ ] **ルート検索機能**: ポート間の経路表示
- [ ] **訪問履歴機能**: ももちゃりポートのスタンプラリー
- [ ] **天気情報の統合**: 降水ナウキャストAPIの活用
- [ ] **多言語対応**: 英語・中国語・韓国語
- [ ] **ダークモード**: 夜間使用時の配慮

### 11.4 技術的改善

- [ ] **TypeScript型定義の強化**: any型の削減
- [ ] **テストの追加**: Jest, React Testing Library
- [ ] **CI/CDパイプライン**: GitHub Actions
- [ ] **コード分割**: Dynamic Importでバンドルサイズ削減
- [ ] **PWA化**: オフライン対応、ホーム画面追加

---

## 付録

### A. 開発環境

- **OS**: Ubuntu on WSL2
- **Node.js**: v18以上
- **npm**: v9以上
- **エディタ**: VS Code（推奨拡張: ESLint, Prettier, Tailwind CSS IntelliSense）

### B. 参考資料

- [MapLibre GL JS 公式ドキュメント](https://maplibre.org/maplibre-gl-js/docs/)
- [react-map-gl 公式ドキュメント](https://visgl.github.io/react-map-gl/)
- [国土地理院ベクトルタイル仕様](https://github.com/gsi-cyberjapan/gsivectortile-mapbox-gl-js)
- [Next.js 14 公式ドキュメント](https://nextjs.org/docs)
- [Tailwind CSS 公式ドキュメント](https://tailwindcss.com/docs)
- [cheerio 公式ドキュメント](https://cheerio.js.org/)
- [中国電力ネットワーク 停電情報サイト](https://www.teideninfo.energia.co.jp/)

### C. 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|----------|
| 2026-01-19 | 3.1 | 停電情報レイヤー、地区境界の遅延ロード、useDistrictLayersフック、スクレイピングAPIの詳細を追加 |
| 2026-01-13 | 3.0 | 全面改訂。現在の実装状況を詳細に記述 |
| 2026-01-12 | 2.0 | MapLibre GL JSへの移行完了 |
| 2026-01-11 | 1.0 | 初版作成（SVGMap.js版） |

---

**作成者**: Claude Code
**最終更新**: 2026年1月19日
