# 02_frontend: フロントエンド仕様 (Next.js)

## 1. 技術スタック

- Framework:
  Next.js + React
- Language:
  TypeScript
- 地図表示:
  - overview:
    SVGMap iframe runtime
  - detail:
    MapLibre React runtime

## 2. ルーティング

| パス | 役割 | 備考 |
|------|------|------|
| `/` | トップページ | 概要、使い方への導線 |
| `/map` | 防災マップ本体 | 3階層ビュー |
| `/about` | データ出典・連絡先 | |
| `/admin/login` | 管理画面ログイン | |
| `/admin/datasets` | データ管理トップ | CSV / Excel アップロード、region 切替 |

## 3. 画面仕様

### 3.1 `/map`

#### 表示階層

- 全国 overview
- 都道府県 overview
- 市区町村詳細

現行の責務分担:

- overview:
  SVGMap
- detail:
  MapLibre

#### 表示方針

- 全国 / 県 overview:
  - basemap なし
  - 行政界 SVG を主役にする
  - L2/L3 個別点は抑制する
- 市区町村詳細:
  - basemap あり
  - `baseArea / evacuation / teamActivity` を表示する

#### レイアウト（PC）

- ヘッダー
- 左サイドパネル
  - 検索ボックス
  - レイヤトグル
  - 状態表示
- 中央
  - 地図領域
- 右または重ね UI
  - 詳細表示
  - 文脈表示

#### レイアウト（スマホ）

- 上部:
  ヘッダー / 基本ボタン
- 中央:
  地図
- 下部またはスライド:
  レイヤ / 詳細 / 検索

## 4. コンポーネント構成

### 4.1 共通

- `<AppHeader />`
- `<Layout />`

### 4.2 `/map`

- `<MapPage />`
  - `/map` の state hub
- `<SvgMapEmbed />`
  - overview runtime bridge
- `<MapLibreHost />`
  - detail runtime bridge
- `<LayerPanel />`
- `<SearchBox />`
- `<PropertySheet />`

補足:

- `MapLibreOverviewMap` のような overview 専用経路は current path の正本ではない

### 4.3 `/admin`

- `<AdminLayout />`
- `<DatasetTable />`
- `<DatasetUploadForm />`
- `<ValidationResult />`

## 5. 状態管理

`MapPage` が主に持つ状態:

- `mapViewport`
- `overviewLevel`
- `selectedOverviewPrefecture`
- `activeLayers`
- `layerOpacity`
- `selectedFeature`
- `configError`
- `runtimeError`
- `dataSourceStatus`

補足:

- overview の切替は `overviewLevel` が正本
- detail のデータ表示は `activeLayers` / `layerOpacity` / API 応答が正本

## 6. 画面遷移・イベントフロー

### 6.1 初期化

1. `/map` にアクセス
2. `MapPage` が `runtime-config` と URL state を読む
3. `regionId === 'japan'` なら `overviewLevel = 'nation'`
4. それ以外は detail で始める

### 6.2 overview

1. `MapPage` が `overviewLayer` を構成する
2. `SvgMapEmbed` が `runtime:setOverviewLayer` を送る
3. `shelters.html` が `japan.svg` または `pref/<XX>.svg` を表示する
4. クリック結果を `runtime:featureSelect` として React に返す
5. React 側 state machine が県 overview / detail へ進める

### 6.3 detail

1. `overviewLevel === 'detail'` になる
2. `MapLibreHost` を描画する
3. L1/L2/L3 を詳細表示する
4. 詳細パネルや検索選択を反映する

### 6.4 検索

- `SearchBox` は
  - 地区辞書
  - 全国市区町村検索
  - 避難所 / チーム活動検索
  を束ねる
- 結果選択後、overview または detail の文脈に応じて移動する

## 7. ステート管理方針

- 現状は React state を中心に管理する
- overview / detail の state machine は `MapPage` に寄せる
- runtime 側は renderer 寄りに保つ

## 8. 改善観点

### 8.1 current path 優先

- frontend 仕様は current path を正本とする
- 将来像より、まず今の責務境界を崩さないことを優先する

### 8.2 per-muni 静的資産の扱い

- current `/map` の detail 正本は MapLibre + JSON / API / fallback
- per-muni SVG は補助 / 比較 / 将来 LoD build の資産として位置づけを整理する

### 8.3 SVGMap ネイティブ移行

- 将来 overview / detail をさらに SVGMap に寄せる余地はある
- ただし current path では detail 正本を急いで移さない

### 8.4 検索の将来スケール

- 現状は地区辞書 + `/api/search` + region-aware API で十分
- 件数増加時は LoD-aware な summary / search 契約を追加する
